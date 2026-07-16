// server.js
// This is the BACKEND. It doesn't render any pixels - it just exposes a set
// of URLs (an "API") that the frontend calls with fetch() to read and write data.
// Run it with: npm start   (from inside the backend folder)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { calculateBasePoints } = require('./scoring');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const PORT = process.env.PORT || 3001;

app.use(cors());          // allows the frontend (a different port) to call this API
app.use(express.json());  // lets us read JSON bodies sent from the frontend

// ---------- helpers ----------

// Middleware that checks the "Authorization: Bearer <token>" header.
// If valid, attaches req.userId. If not, blocks the request with 401.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

function publicUser(row) {
  return { id: row.id, username: row.username, bodyweight_kg: row.bodyweight_kg, bio: row.bio };
}

// Attaches vote totals + the current viewer's own vote (if logged in) to a post row.
function attachVoteInfo(post, viewerId) {
  const voteSum = db.prepare('SELECT COALESCE(SUM(value),0) as total FROM votes WHERE post_id = ?').get(post.id).total;
  const myVote = viewerId
    ? db.prepare('SELECT value FROM votes WHERE post_id = ? AND user_id = ?').get(post.id, viewerId)
    : null;
  return {
    ...post,
    vote_total: voteSum,
    total_points: post.base_points + voteSum,
    my_vote: myVote ? myVote.value : 0
  };
}

// ---------- auth routes ----------

app.post('/api/auth/signup', (req, res) => {
  const { username, password, bodyweight_kg } = req.body;
  if (!username || !password || !bodyweight_kg) {
    return res.status(400).json({ error: 'username, password, and bodyweight_kg are all required' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'That username is taken' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, bodyweight_kg) VALUES (?, ?, ?)'
  ).run(username, passwordHash, bodyweight_kg);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: publicUser(user) });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({ user: publicUser(user) });
});

// ---------- post routes ----------

// Feed. Optional ?sort=top (highest points first) or ?sort=new (default)
app.get('/api/posts', (req, res) => {
  const viewerId = getViewerIdIfAny(req);
  const posts = db.prepare(`
    SELECT posts.*, users.username
    FROM posts JOIN users ON users.id = posts.user_id
    ORDER BY posts.created_at DESC
  `).all();

  let withVotes = posts.map(p => attachVoteInfo(p, viewerId));
  if (req.query.sort === 'top') {
    withVotes = withVotes.sort((a, b) => b.total_points - a.total_points);
  }
  res.json({ posts: withVotes });
});

app.post('/api/posts', requireAuth, (req, res) => {
  const { lift_name, weight_kg, reps, caption, image_url } = req.body;
  if (!lift_name || !weight_kg || !reps) {
    return res.status(400).json({ error: 'lift_name, weight_kg, and reps are required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  const basePoints = calculateBasePoints(Number(weight_kg), Number(reps), user.bodyweight_kg);

  const result = db.prepare(`
    INSERT INTO posts (user_id, lift_name, weight_kg, reps, bodyweight_kg, caption, image_url, base_points)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.userId, lift_name, weight_kg, reps, user.bodyweight_kg, caption || '', image_url || '', basePoints);

  const post = db.prepare(`
    SELECT posts.*, users.username FROM posts JOIN users ON users.id = posts.user_id WHERE posts.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json({ post: attachVoteInfo(post, req.userId) });
});

app.delete('/api/posts/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.user_id !== req.userId) return res.status(403).json({ error: 'Not your post' });
  db.prepare('DELETE FROM votes WHERE post_id = ?').run(post.id);
  db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  res.json({ ok: true });
});

// Vote on a post. Body: { value: 1 } or { value: -1 }. Sending the same value again removes the vote (toggle).
app.post('/api/posts/:id/vote', requireAuth, (req, res) => {
  const value = Number(req.body.value);
  if (value !== 1 && value !== -1) return res.status(400).json({ error: 'value must be 1 or -1' });

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const existing = db.prepare('SELECT * FROM votes WHERE post_id = ? AND user_id = ?').get(post.id, req.userId);
  if (existing && existing.value === value) {
    db.prepare('DELETE FROM votes WHERE id = ?').run(existing.id); // toggle off
  } else if (existing) {
    db.prepare('UPDATE votes SET value = ? WHERE id = ?').run(value, existing.id);
  } else {
    db.prepare('INSERT INTO votes (post_id, user_id, value) VALUES (?, ?, ?)').run(post.id, req.userId, value);
  }

  const updated = db.prepare(`
    SELECT posts.*, users.username FROM posts JOIN users ON users.id = posts.user_id WHERE posts.id = ?
  `).get(post.id);
  res.json({ post: attachVoteInfo(updated, req.userId) });
});

// ---------- profile + leaderboard ----------

app.get('/api/users/:id', (req, res) => {
  const viewerId = getViewerIdIfAny(req);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const posts = db.prepare(`
    SELECT posts.*, users.username FROM posts JOIN users ON users.id = posts.user_id
    WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.params.id).map(p => attachVoteInfo(p, viewerId));

  const totalPoints = posts.reduce((sum, p) => sum + p.total_points, 0);
  res.json({ user: publicUser(user), posts, total_points: totalPoints });
});

app.get('/api/leaderboard', (req, res) => {
  const users = db.prepare('SELECT * FROM users').all();
  const board = users.map(u => {
    const posts = db.prepare('SELECT * FROM posts WHERE user_id = ?').all(u.id);
    const totalPoints = posts.reduce((sum, p) => {
      const voteSum = db.prepare('SELECT COALESCE(SUM(value),0) as t FROM votes WHERE post_id = ?').get(p.id).t;
      return sum + p.base_points + voteSum;
    }, 0);
    return { id: u.id, username: u.username, total_points: totalPoints, post_count: posts.length };
  }).sort((a, b) => b.total_points - a.total_points);
  res.json({ leaderboard: board });
});

function getViewerIdIfAny(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET).userId;
  } catch {
    return null;
  }
}

app.listen(PORT, () => {
  console.log(`FitLift backend running at http://localhost:${PORT}`);
});
