// app.js
// This is the FRONTEND. Everything here runs in the user's browser.
// Its job: draw the screen, and talk to the backend API using fetch().
// The backend (server.js) is the only thing that touches the database.

const API_BASE = 'http://localhost:3001/api';

// ---------- simple app state ----------
let token = localStorage.getItem('fitlift_token') || null;
let currentUser = JSON.parse(localStorage.getItem('fitlift_user') || 'null');
let currentSort = 'new';

// ---------- tiny router: show one <section class="view"> at a time ----------
const views = ['feed', 'leaderboard', 'new-post', 'profile', 'auth'];

function showView(name, opts = {}) {
  views.forEach(v => {
    document.getElementById(`view-${v}`).hidden = v !== name;
  });
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === name);
  });
  if (name === 'feed') loadFeed();
  if (name === 'leaderboard') loadLeaderboard();
  if (name === 'profile') loadProfile(opts.userId || currentUser?.id);
}

document.querySelectorAll('[data-nav]').forEach(el => {
  el.addEventListener('click', () => showView(el.dataset.nav));
});

// ---------- auth ----------

function saveSession(newToken, user) {
  token = newToken;
  currentUser = user;
  localStorage.setItem('fitlift_token', token);
  localStorage.setItem('fitlift_user', JSON.stringify(user));
  renderAuthArea();
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('fitlift_token');
  localStorage.removeItem('fitlift_user');
  renderAuthArea();
  showView('feed');
}

function renderAuthArea() {
  const area = document.getElementById('auth-area');
  const newPostBtn = document.getElementById('nav-new-post');
  if (currentUser) {
    newPostBtn.hidden = false;
    area.innerHTML = `
      <button class="me-btn" id="me-btn">${escapeHtml(currentUser.username)}</button>
      <button class="ghost-btn" id="logout-btn">Log out</button>
    `;
    document.getElementById('me-btn').addEventListener('click', () => showView('profile', { userId: currentUser.id }));
    document.getElementById('logout-btn').addEventListener('click', logout);
  } else {
    newPostBtn.hidden = true;
    area.innerHTML = `<button id="show-auth-btn">Log in / Sign up</button>`;
    document.getElementById('show-auth-btn').addEventListener('click', () => showView('auth'));
  }
}

// auth tabs (login vs signup)
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('login-form').hidden = tab.dataset.authtab !== 'login';
    document.getElementById('signup-form').hidden = tab.dataset.authtab !== 'signup';
  });
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const data = await api('POST', '/auth/login', {
      username: form.get('username'),
      password: form.get('password')
    });
    saveSession(data.token, data.user);
    showView('feed');
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const errEl = document.getElementById('signup-error');
  errEl.textContent = '';
  try {
    const data = await api('POST', '/auth/signup', {
      username: form.get('username'),
      password: form.get('password'),
      bodyweight_kg: Number(form.get('bodyweight_kg'))
    });
    saveSession(data.token, data.user);
    showView('feed');
  } catch (err) {
    errEl.textContent = err.message;
  }
});

// ---------- feed ----------

document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentSort = btn.dataset.sort;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadFeed();
  });
});

async function loadFeed() {
  const list = document.getElementById('feed-list');
  list.innerHTML = `<p class="muted">Loading lifts&hellip;</p>`;
  try {
    const data = await api('GET', `/posts?sort=${currentSort}`);
    if (data.posts.length === 0) {
      list.innerHTML = `<p class="muted">No lifts posted yet. Be the first.</p>`;
      return;
    }
    list.innerHTML = '';
    data.posts.forEach(post => list.appendChild(renderPostCard(post)));
  } catch (err) {
    list.innerHTML = `<p class="muted">Couldn't load the feed: ${escapeHtml(err.message)}</p>`;
  }
}

function renderPostCard(post) {
  const tpl = document.getElementById('post-card-template');
  const node = tpl.content.cloneNode(true);
  const card = node.querySelector('.post-card');
  card.dataset.postId = post.id;

  node.querySelectorAll('[data-goto-profile]').forEach(el => {
    if (el.classList.contains('avatar')) el.textContent = post.username.slice(0, 2).toUpperCase();
    if (el.classList.contains('username-link')) el.textContent = post.username;
    el.addEventListener('click', () => showView('profile', { userId: post.user_id }));
  });

  node.querySelector('.post-time').textContent = timeAgo(post.created_at);
  node.querySelector('.points-num').textContent = post.total_points;

  node.querySelector('.lift-name').textContent = post.lift_name;
  node.querySelector('.lift-weight').textContent =
    `${post.weight_kg}kg x ${post.reps} (bw ${post.bodyweight_kg}kg)`;

  const ratio = post.base_points / 100; // e.g. 150 base points = 1.5x bodyweight
  const fraction = Math.max(0, Math.min(ratio / 2.5, 1)); // 2.5x bodyweight = full gauge
  const fillWidth = 176 * fraction;
  node.querySelector('.plates-fill').innerHTML =
    `<rect x="14" y="10" width="${fillWidth.toFixed(1)}" height="8" rx="3" fill="var(--accent)"></rect>`;
  node.querySelector('.ratio-label').textContent = `${ratio.toFixed(2)}x bodyweight`;

  if (post.image_url) {
    const img = node.querySelector('.post-image');
    img.src = post.image_url;
    img.hidden = false;
  }
  node.querySelector('.post-caption').textContent = post.caption || '';
  node.querySelector('.vote-total').textContent = post.vote_total;

  const upBtn = node.querySelector('.vote-btn.up');
  const downBtn = node.querySelector('.vote-btn.down');
  if (post.my_vote === 1) upBtn.classList.add('voted-up');
  if (post.my_vote === -1) downBtn.classList.add('voted-down');

  [upBtn, downBtn].forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!currentUser) return showView('auth');
      try {
        const data = await api('POST', `/posts/${post.id}/vote`, { value: Number(btn.dataset.vote) });
        card.replaceWith(renderPostCard(data.post));
      } catch (err) {
        alert(err.message);
      }
    });
  });

  const deleteBtn = node.querySelector('.delete-btn');
  if (currentUser && currentUser.id === post.user_id) {
    deleteBtn.hidden = false;
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Delete this post?')) return;
      await api('DELETE', `/posts/${post.id}`);
      card.remove();
    });
  }

  return node;
}

// ---------- new post ----------

document.getElementById('post-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const errEl = document.getElementById('post-error');
  errEl.textContent = '';
  try {
    await api('POST', '/posts', {
      lift_name: form.get('lift_name'),
      weight_kg: Number(form.get('weight_kg')),
      reps: Number(form.get('reps')),
      caption: form.get('caption'),
      image_url: form.get('image_url')
    });
    e.target.reset();
    showView('feed');
  } catch (err) {
    errEl.textContent = err.message;
  }
});

// ---------- leaderboard ----------

async function loadLeaderboard() {
  const body = document.getElementById('leaderboard-body');
  body.innerHTML = `<tr><td colspan="4" class="muted">Loading&hellip;</td></tr>`;
  try {
    const data = await api('GET', '/leaderboard');
    body.innerHTML = '';
    data.leaderboard.forEach((row, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>#${i + 1}</td>
        <td>${escapeHtml(row.username)}</td>
        <td>${row.total_points}</td>
        <td>${row.post_count}</td>
      `;
      tr.querySelector('td:nth-child(2)').addEventListener('click', () => showView('profile', { userId: row.id }));
      body.appendChild(tr);
    });
  } catch (err) {
    body.innerHTML = `<tr><td colspan="4" class="muted">${escapeHtml(err.message)}</td></tr>`;
  }
}

// ---------- profile ----------

async function loadProfile(userId) {
  const el = document.getElementById('profile-content');
  if (!userId) {
    el.innerHTML = `<p class="muted">Log in to see your profile.</p>`;
    return;
  }
  el.innerHTML = `<p class="muted">Loading&hellip;</p>`;
  try {
    const data = await api('GET', `/users/${userId}`);
    el.innerHTML = `
      <div class="profile-header">
        <div class="profile-avatar">${data.user.username.slice(0, 2).toUpperCase()}</div>
        <div>
          <div class="profile-name">${escapeHtml(data.user.username)}</div>
          <div class="muted">Bodyweight: ${data.user.bodyweight_kg}kg</div>
          <div class="profile-points">${data.total_points} total points</div>
        </div>
      </div>
      <div class="post-list" id="profile-posts"></div>
    `;
    const list = document.getElementById('profile-posts');
    if (data.posts.length === 0) {
      list.innerHTML = `<p class="muted">No lifts posted yet.</p>`;
    } else {
      data.posts.forEach(post => list.appendChild(renderPostCard(post)));
    }
  } catch (err) {
    el.innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`;
  }
}

// ---------- helpers ----------

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString + 'Z')) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------- boot ----------
renderAuthArea();
showView('feed');
