// ============================================================
//  Tennis Tournament — app.js
//  PWA + Supabase + Push Notifications + Email
// ============================================================

const SUPABASE_URL   = 'https://irftqzegmgcjqpivuwhr.supabase.co';
const SUPABASE_ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZnRxemVnbWdjanFwaXZ1d2hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTU0NjAsImV4cCI6MjA4OTg3MTQ2MH0.6YPrGR6eTVxtLzUasMKcepS7zgRD7B5tK-L4CtkIhGs';
const VAPID_PUBLIC   = 'BOU89Qx4UolYpcmd7dwfuXUY9ESzBtjCoR0tXbAVIDaaI4jIlg7NG4xqQ3e26KpE2ryLSAVeaJDWQxeUPVnrgQA';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ---- COLORS ----
const AC = [
  {bg:'#E6F1FB',txt:'#0C447C'},{bg:'#EAF3DE',txt:'#27500A'},
  {bg:'#EEEDFE',txt:'#3C3489'},{bg:'#FAEEDA',txt:'#633806'},
  {bg:'#E1F5EE',txt:'#085041'},{bg:'#FBEAF0',txt:'#72243E'},
  {bg:'#FAECE7',txt:'#712B13'},{bg:'#F1EFE8',txt:'#444441'},
];
const ac  = i => AC[i % AC.length];
const ini = n => (n||'?').trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2)||'?';
const nsl = () => Math.random().toString(36).slice(2,8);

// ============================================================
//  STATE
// ============================================================
let S = {
  page: 'home',         // home | auth | create | tournament | install
  authMode: 'login',
  user: null, profile: null,
  myTournaments: [],
  tournament: null,
  players: [], teams: [], pools: [], poolMatches: [], bracketMatches: [],
  adminTab: 'setup', pubTab: 'register',
  myPlayerId: null, currentModal: null,
  loading: false, error: null, successMsg: null,
  shareToast: false,
  // PWA
  pwaInstallable: false,
  pwaInstalled: false,
  // Notification permission
  notifPermission: 'default',
  // Install page context (slug en attente)
  pendingSlug: null,
};

// ============================================================
//  BOOT
// ============================================================
async function boot() {
  S.loading = true; render();

  // Magic link — Supabase insère le token dans le hash #access_token=...
  // getSession() le détecte et crée la session automatiquement
  if (window.location.hash.includes('access_token') || window.location.hash.includes('type=magiclink') || window.location.hash.includes('type=recovery')) {
    await sb.auth.getSession();
    history.replaceState(null, '', window.location.pathname);
  }

  // Auth
  const { data: { session } } = await sb.auth.getSession();
  if (session) { S.user = session.user; await loadProfile(); }

  // PWA state
  S.notifPermission = 'Notification' in window ? Notification.permission : 'denied';
  S.pwaInstalled = window.isStandalone?.() || false;

  window.addEventListener('pwa-installable', () => { S.pwaInstallable = true; render(); });
  window.addEventListener('pwa-installed',   () => { S.pwaInstalled = true; S.pwaInstallable = false; render(); });

  // Routing
  const slug = getSlugFromURL();
  if (slug) {
    const t = await fetchTournamentBySlug(slug);
    if (t) {
      // Si on arrive via un lien partagé → page d'install d'abord
      if (!window.isStandalone?.()) {
        S.pendingSlug = slug;
        S.tournament = t;
        S.page = 'install';
      } else {
        await loadTournamentBySlug(slug);
      }
    }
  }

  S.loading = false; render();

  sb.auth.onAuthStateChange(async (event, session) => {
    S.user = session?.user || null;
    if (S.user) {
      await loadProfile();
      if (S.page === 'auth') { S.page = 'home'; S.successMsg = null; }
    } else {
      S.profile = null; S.myTournaments = [];
    }
    render();
  });
}

// ============================================================
//  ROUTING
// ============================================================
function getSlugFromURL() {
  const p = window.location.pathname.replace(/^\//, '');
  return (p && p !== 'index.html') ? p : null;
}

async function fetchTournamentBySlug(slug) {
  const { data } = await sb.from('tournaments').select('*').eq('slug', slug).single();
  return data || null;
}

async function loadTournamentBySlug(slug) {
  const t = await fetchTournamentBySlug(slug);
  if (!t) { S.page = 'home'; return; }
  S.tournament = t;
  S.page = 'tournament';
  S.pubTab = 'register';
  S.adminTab = 'setup';
  await loadTournamentData();
}

async function loadTournamentData() {
  if (!S.tournament) return;
  const tid = S.tournament.id;
  const [pR, tR, poolR, pmR, bmR] = await Promise.all([
    sb.from('players').select('*').eq('tournament_id', tid).order('created_at'),
    sb.from('teams').select('*').eq('tournament_id', tid),
    sb.from('pools').select('*').eq('tournament_id', tid).order('pool_index'),
    sb.from('pool_matches').select('*').eq('tournament_id', tid),
    sb.from('bracket_matches').select('*').eq('tournament_id', tid).order('round').order('position'),
  ]);
  S.players = pR.data||[]; S.teams = tR.data||[]; S.pools = poolR.data||[];
  S.poolMatches = pmR.data||[]; S.bracketMatches = bmR.data||[];
}

async function loadProfile() {
  const { data } = await sb.from('profiles').select('*').eq('id', S.user.id).single();
  S.profile = data;
  await loadMyTournaments();
}

async function loadMyTournaments() {
  if (!S.user) return;
  const { data } = await sb.from('tournaments').select('*').eq('owner_id', S.user.id).order('created_at', { ascending: false });
  S.myTournaments = data || [];
}

// ============================================================
//  RENDER
// ============================================================
function render() {
  const root = document.getElementById('root');
  if (!root) return;
  if (S.loading) {
    root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:80vh;flex-direction:column;gap:12px">
      <div style="font-size:32px">🎾</div>
      <div style="color:var(--text2);font-size:14px">Chargement…</div>
    </div>`;
    return;
  }
  root.innerHTML = renderPage();
  if (S.currentModal) renderModal();
  if (S.shareToast) showToast('Lien copié ! Collez-le dans WhatsApp 🎾', 3000);
}

function renderPage() {
  if (S.page === 'install')        return renderInstallPage();
  if (S.page === 'auth')           return renderAuth();
  if (S.page === 'create')         return renderCreate();
  if (S.page === 'tournament')     return renderTournamentPage();
  return renderHome();
}

function showToast(msg, duration = 3000) {
  S.shareToast = false;
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:10px 20px;border-radius:8px;font-size:13px;z-index:999;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.15)';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

// ============================================================
//  INSTALL PAGE — affiché quand on arrive via un lien partagé
// ============================================================
function renderInstallPage() {
  const t = S.tournament;
  const isIOS = window.isIOS?.();
  const canInstall = window.canInstallPWA?.();
  const playerCount = S.players.length;

  return `<div class="app" style="max-width:480px;margin:0 auto">
    <!-- Header tournoi -->
    <div style="text-align:center;padding:2rem 0 1.5rem">
      <div style="font-size:48px;margin-bottom:12px">🎾</div>
      <h1 style="font-size:22px;margin-bottom:6px">${t.name}</h1>
      <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-bottom:8px">
        <span class="status s-${t.status}">${statusLabel(t.status)}</span>
        <span class="badge">${playerCount} joueur${playerCount!==1?'s':''} inscrits</span>
        <span class="pill ${t.mode==='double'?'pill-double':'pill-simple'}">${t.mode==='double'?'Double':'Simple'}</span>
      </div>
      <p style="color:var(--text2);font-size:14px">Vous avez été invité à rejoindre ce tournoi !</p>
    </div>

    <!-- Option 1 : Installer l'app -->
    ${!S.pwaInstalled ? `
    <div class="card" style="margin-bottom:12px;border:2px solid var(--border2)">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div style="width:44px;height:44px;background:var(--text);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🎾</div>
        <div>
          <div style="font-weight:600;font-size:15px">Installer l'application</div>
          <div style="font-size:12px;color:var(--text2)">Notifications, accès rapide, fonctionne hors ligne</div>
        </div>
      </div>
      ${canInstall ? `
        <button class="btn btn-primary" style="width:100%;justify-content:center;margin-bottom:8px" onclick="installPWA()">
          Installer l'app Tennis
        </button>` : ''}
      ${isIOS ? `
        <div style="background:var(--bg2);border-radius:var(--radius);padding:12px;font-size:13px;color:var(--text2)">
          <div style="font-weight:500;color:var(--text);margin-bottom:6px">Sur iPhone :</div>
          <div style="margin-bottom:4px">1. Appuyez sur <strong>Partager</strong> <span style="font-size:16px">⎙</span> en bas de Safari</div>
          <div style="margin-bottom:4px">2. Faites défiler et appuyez sur <strong>"Sur l'écran d'accueil"</strong></div>
          <div>3. Appuyez sur <strong>Ajouter</strong></div>
        </div>` : ''}
      ${!canInstall && !isIOS ? `
        <div style="font-size:12px;color:var(--text2);text-align:center">
          Ouvrez ce lien dans Chrome ou Safari pour installer l'app
        </div>` : ''}
    </div>` : `
    <div class="card" style="margin-bottom:12px;background:var(--green-bg);border-color:var(--green)">
      <div style="color:var(--green);font-weight:500;font-size:14px">✓ Application installée !</div>
    </div>`}

    <!-- Option 2 : Continuer sur le navigateur -->
    <div class="card" style="margin-bottom:16px">
      <div style="font-weight:500;font-size:14px;margin-bottom:8px">Continuer sur le navigateur</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:12px">Pas d'installation nécessaire — accédez directement au tournoi.</div>
      <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="continueToTournament()">
        S'inscrire au tournoi →
      </button>
    </div>

    <p style="text-align:center;font-size:12px;color:var(--text2)">
      Organisé par ${t.owner_id ? '…' : 'un ami'} · 
      <a href="#" onclick="continueToTournament();return false" style="color:var(--blue)">Voir le tableau</a>
    </p>
  </div>`;
}

async function installPWA() {
  const accepted = await window.triggerInstallPrompt?.();
  if (accepted) {
    S.pwaInstalled = true;
    showToast('Application installée ! 🎾');
    setTimeout(() => continueToTournament(), 1000);
  }
}

async function continueToTournament() {
  const slug = S.pendingSlug;
  S.pendingSlug = null;
  if (slug) {
    await loadTournamentData();
    S.page = 'tournament';
    S.pubTab = 'register';
    render();
  }
}

// ============================================================
//  RESET PASSWORD PAGE
// ============================================================
function renderResetPassword() {
  return `<div class="app"><div style="max-width:380px;margin:2rem auto">
    <div class="card">
      <h3 style="margin-bottom:.25rem">Nouveau mot de passe</h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:1rem">Choisissez un nouveau mot de passe pour votre compte.</p>
      ${S.error?`<div style="padding:10px 12px;background:var(--red-bg);color:var(--red);border-radius:var(--radius);margin-bottom:12px;font-size:13px;display:flex;gap:8px">
        <span>⚠️</span><span>${S.error}</span>
      </div>`:''}
      ${S.successMsg?`<div style="padding:10px 12px;background:var(--green-bg);color:var(--green);border-radius:var(--radius);margin-bottom:12px;font-size:13px">
        ✓ ${S.successMsg}
      </div>`:''}
      <div class="fg" style="margin-bottom:6px"><label>Nouveau mot de passe</label>
        <div style="position:relative">
          <input type="password" id="new-pwd1" placeholder="••••••••" onkeydown="if(event.key==='Enter')submitResetPassword()"
            style="padding-right:44px"/>
          <button onclick="togglePwdField('new-pwd1','toggle1')" type="button" id="toggle1"
            style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text2);font-size:16px;padding:0;line-height:1">👁</button>
        </div>
      </div>
      <div class="fg" style="margin-bottom:1rem"><label>Confirmer le mot de passe</label>
        <div style="position:relative">
          <input type="password" id="new-pwd2" placeholder="••••••••" onkeydown="if(event.key==='Enter')submitResetPassword()"
            style="padding-right:44px"/>
          <button onclick="togglePwdField('new-pwd2','toggle2')" type="button" id="toggle2"
            style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text2);font-size:16px;padding:0;line-height:1">👁</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:1rem">Min. 6 caractères</div>
      <button class="btn btn-primary" style="width:100%" onclick="submitResetPassword()">Enregistrer le mot de passe</button>
    </div>
  </div></div>`;
}

function togglePwdField(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  if (!input) return;
  if (input.type === 'password') { input.type = 'text';     btn.textContent = '🙈'; }
  else                           { input.type = 'password'; btn.textContent = '👁'; }
  input.focus();
}

async function submitResetPassword() {
  const pwd1 = document.getElementById('new-pwd1')?.value;
  const pwd2 = document.getElementById('new-pwd2')?.value;
  if (!pwd1 || pwd1.length < 6) { S.error = 'Le mot de passe doit faire au moins 6 caractères'; render(); return; }
  if (pwd1 !== pwd2) { S.error = 'Les deux mots de passe ne correspondent pas'; render(); return; }
  S.error = null;
  const { error } = await sb.auth.updateUser({ password: pwd1 });
  if (error) { S.error = error.message; render(); return; }
  S.successMsg = 'Mot de passe mis à jour ! Vous allez être redirigé…';
  S.error = null;
  render();
  setTimeout(() => { S.page = 'home'; S.successMsg = null; render(); }, 2000);
}

// ============================================================
//  HOME
// ============================================================
function renderHome() {
  return `<div class="app">
    <div class="app-header">
      <div>
        <h1>🎾 Tournois de tennis</h1>
        <div style="font-size:13px;color:var(--text2);margin-top:3px">Créez et partagez vos tournois</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px">
        ${S.user
          ? `<span style="font-size:13px;color:var(--text2)">${S.profile?.username||S.user.email}</span>
             <button class="btn" onclick="signOut()">Déconnexion</button>`
          : `<button class="btn btn-primary" onclick="goAuth()">Se connecter</button>`}
      </div>
    </div>

    <!-- Bannière install PWA sur home -->
    ${!S.pwaInstalled && (window.canInstallPWA?.() || window.isIOS?.()) ? `
    <div class="card" style="margin-bottom:1rem;display:flex;align-items:center;gap:12px;padding:.75rem 1rem">
      <div style="font-size:24px">📱</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500">Installer l'app</div>
        <div style="font-size:12px;color:var(--text2)">Accès rapide + notifications sur votre téléphone</div>
      </div>
      ${window.canInstallPWA?.() ? `<button class="btn btn-sm btn-primary" onclick="installPWA()">Installer</button>` : ''}
    </div>` : ''}

    ${S.user ? renderMyTournaments() : renderLanding()}
  </div>`;
}

function renderLanding() {
  return `<div style="max-width:520px;margin:3rem auto;text-align:center">
    <div style="font-size:48px;margin-bottom:1rem">🎾</div>
    <h2 style="margin-bottom:.5rem;font-size:22px">Organisez vos tournois entre amis</h2>
    <p style="color:var(--text2);font-size:14px;line-height:1.7;margin-bottom:1.5rem">
      Créez un tournoi, partagez le lien dans WhatsApp.<br>
      Vos amis s'inscrivent en un clic et reçoivent des notifications pour leurs matchs.
    </p>
    <button class="btn btn-primary" style="padding:10px 28px;font-size:15px" onclick="goAuth()">
      Commencer — c'est gratuit
    </button>
    <p style="font-size:12px;color:var(--text2);margin-top:1rem">Connexion sans mot de passe · PWA installable · Notifications</p>
  </div>`;
}

function renderMyTournaments() {
  return `<div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <h2 style="margin:0">Mes tournois</h2>
      <button class="btn btn-primary" onclick="S.page='create';S.error=null;render()">+ Nouveau tournoi</button>
    </div>
    ${!S.myTournaments.length
      ? `<div class="card" style="text-align:center;padding:2rem">
          <div style="font-size:32px;margin-bottom:.75rem">🎾</div>
          <div style="margin-bottom:1rem;color:var(--text2)">Aucun tournoi créé.</div>
          <button class="btn btn-primary" onclick="S.page='create';S.error=null;render()">Créer mon premier tournoi</button>
         </div>`
      : `<div class="grid3">${S.myTournaments.map(t=>`
          <div class="card" style="cursor:pointer" onclick="goTournament('${t.slug}')">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
              <div style="font-weight:600;font-size:14px;flex:1;margin-right:8px">${t.name}</div>
              <span class="status s-${t.status}" style="font-size:10px">${statusLabel(t.status)}</span>
            </div>
            <div style="font-size:12px;color:var(--text2);margin-bottom:12px">
              <span class="pill ${t.mode==='double'?'pill-double':'pill-simple'}">${t.mode==='double'?'Double':'Simple'}</span>
              <span style="margin-left:4px">${t.format==='pools+bracket'?'Poules + Tableau':'Tableau direct'}</span>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm" style="flex:1;justify-content:center" onclick="event.stopPropagation();goTournament('${t.slug}')">Gérer</button>
              <button class="btn btn-sm btn-success" onclick="event.stopPropagation();shareLink('${t.slug}')">Partager</button>
            </div>
          </div>`).join('')}</div>`}
  </div>`;
}

// ============================================================
//  AUTH — Magic Link (sans mot de passe)
// ============================================================
function renderAuth() {
  return `<div class="app"><div style="max-width:380px;margin:2rem auto">
    <button class="btn btn-sm" style="margin-bottom:1rem" onclick="S.page='home';S.error=null;S.successMsg=null;render()">← Retour</button>
    <div class="card">
      ${!S.successMsg ? `
        <div style="text-align:center;margin-bottom:1.25rem">
          <div style="font-size:36px;margin-bottom:8px">🔗</div>
          <h3 style="margin-bottom:4px">Connexion sans mot de passe</h3>
          <p style="font-size:13px;color:var(--text2)">Entrez votre email — on vous envoie un lien magique pour vous connecter instantanément.</p>
        </div>
        ${S.error?`<div style="padding:10px 12px;background:var(--red-bg);color:var(--red);border-radius:var(--radius);margin-bottom:12px;font-size:13px;display:flex;gap:8px">
          <span>⚠️</span><span>${S.error}</span>
        </div>`:''}
        <div class="fg" style="margin-bottom:1rem">
          <label>Votre email</label>
          <input type="email" id="auth-email" placeholder="email@exemple.com"
            onkeydown="if(event.key==='Enter')submitMagicLink()" autofocus/>
        </div>
        <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="submitMagicLink()">
          Recevoir le lien de connexion
        </button>
        <p style="text-align:center;font-size:12px;color:var(--text2);margin-top:12px">
          Première fois ? Un compte est créé automatiquement.
        </p>
      ` : `
        <div style="text-align:center;padding:1rem 0">
          <div style="font-size:48px;margin-bottom:12px">📬</div>
          <h3 style="margin-bottom:8px">Vérifiez votre email !</h3>
          <p style="font-size:14px;color:var(--text2);line-height:1.6">${S.successMsg}</p>
          <p style="font-size:12px;color:var(--text3);margin-top:12px">Le lien est valable 1 heure.</p>
          <button class="btn" style="margin-top:1.25rem" onclick="S.successMsg=null;S.error=null;render()">
            ← Changer d'email
          </button>
        </div>
      `}
    </div>
  </div></div>`;
}

// ============================================================
//  CREATE TOURNAMENT
// ============================================================
function renderCreate() {
  return `<div class="app"><div style="max-width:560px">
    <button class="btn btn-sm" style="margin-bottom:1rem" onclick="S.page='home';S.error=null;render()">← Retour</button>
    <h2 style="margin-bottom:1rem">Nouveau tournoi</h2>
    <div class="card">
      <div class="fg" style="margin-bottom:8px"><label>Nom du tournoi *</label>
        <input id="c-name" placeholder="Tournoi de l'été 2025"/></div>
      <div class="frow" style="margin-bottom:8px">
        <div class="fg"><label>Mode</label><select id="c-mode">
          <option value="simple">Simple (1v1)</option>
          <option value="double">Double (2v2)</option>
        </select></div>
        <div class="fg"><label>Format</label><select id="c-format">
          <option value="bracket">Tableau direct</option>
          <option value="pools+bracket">Poules + Tableau</option>
        </select></div>
      </div>
      <div class="frow" style="margin-bottom:1rem">
        <div class="fg"><label>Scores</label><select id="c-score">
          <option value="both">Les deux selon le tour</option>
          <option value="simple">Score simple</option>
          <option value="sets">Par sets</option>
        </select></div>
        <div class="fg"><label>Max joueurs</label><input type="number" id="c-max" value="16" min="4" max="64"/></div>
      </div>
      ${S.error?`<div style="padding:8px 12px;background:var(--red-bg);color:var(--red);border-radius:var(--radius);margin-bottom:10px;font-size:13px">${S.error}</div>`:''}
      <button class="btn btn-primary" style="width:100%" onclick="createTournament()">Créer le tournoi →</button>
    </div>
  </div></div>`;
}

// ============================================================
//  TOURNAMENT PAGE
// ============================================================
function renderTournamentPage() {
  const t = S.tournament;
  if (!t) return '';
  const isOwner = S.user && S.user.id === t.owner_id;
  return `<div class="app">
    <div class="app-header">
      <div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="goHome()">← Accueil</button>
          <h1>${t.name}</h1>
        </div>
        <div class="app-header-meta">
          <span class="status s-${t.status}">${statusLabel(t.status)}</span>
          <span class="badge">${S.players.length} joueur${S.players.length!==1?'s':''}</span>
          <span class="pill ${t.mode==='double'?'pill-double':'pill-simple'}">${t.mode==='double'?'Double':'Simple'}</span>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
        <button class="btn btn-success" onclick="shareLink('${t.slug}')">📤 Partager</button>
        ${isOwner ? (S.pubTab==='__admin__'
          ? `<button class="btn" onclick="S.pubTab='register';render()">Vue joueur</button>`
          : `<button class="btn btn-primary" onclick="S.pubTab='__admin__';render()">Admin</button>`)
          : ''}
      </div>
    </div>
    ${S.pubTab==='__admin__'&&isOwner ? renderAdminTabs() : renderPublicTabs()}
  </div>`;
}

function renderPublicTabs() {
  const t = S.tournament;
  const tabs = [
    {id:'register',label:'Inscription'},
    {id:'bracket', label:'Tableau'},
    ...(t.format==='pools+bracket'?[{id:'pools',label:'Poules'}]:[]),
    {id:'matchs',  label:'Mes matchs'},
    {id:'players', label:'Joueurs'},
  ];
  const renderers = {
    register: renderRegister, bracket: ()=>renderBracketView(false),
    pools: ()=>renderPoolsView(false), matchs: renderMyMatches, players: renderPlayersPublic,
  };
  return `<div class="tab-bar">${tabs.map(tab=>`
    <button class="tab ${S.pubTab===tab.id?'active':''}" onclick="S.pubTab='${tab.id}';render()">${tab.label}</button>`).join('')}
  </div>${renderers[S.pubTab]?.() || ''}`;
}

function renderAdminTabs() {
  const t = S.tournament;
  const tabs = [
    {id:'setup',label:'Configuration'},{id:'players',label:'Joueurs'},
    ...(t.mode==='double'?[{id:'teams',label:'Équipes'}]:[]),
    ...(t.format==='pools+bracket'?[{id:'pools',label:'Poules'}]:[]),
    {id:'bracket',label:'Tableau'},{id:'standings',label:'Classement'},
  ];
  const renderers = {
    setup: renderSetup, players: renderAdminPlayers, teams: renderAdminTeams,
    pools: ()=>renderPoolsView(true), bracket: ()=>renderBracketView(true), standings: renderStandings,
  };
  return `<div class="tab-bar">${tabs.map(tab=>`
    <button class="tab ${S.adminTab===tab.id?'active':''}" onclick="S.adminTab='${tab.id}';render()">${tab.label}</button>`).join('')}
  </div>${renderers[S.adminTab]?.() || ''}`;
}

// ============================================================
//  REGISTER VIEW — avec demande de notifications
// ============================================================
function renderRegister() {
  const t = S.tournament;
  if (t.status !== 'open') return `<div class="empty">Les inscriptions sont fermées.</div>`;
  const notifGranted = S.notifPermission === 'granted';
  return `<div class="reg-card"><div class="card">
    <h3>S'inscrire au tournoi</h3>
    <div class="frow" style="margin-bottom:8px">
      <div class="fg"><label>Prénom *</label><input id="reg-firstname" placeholder="Rafael"/></div>
      <div class="fg"><label>Nom *</label><input id="reg-lastname" placeholder="Nadal"/></div>
    </div>
    <div class="fg" style="margin-bottom:8px"><label>Classement tennis</label>
      <select id="reg-level">
        <option value="">— Non classé</option>
        <option>NC</option><option>40</option><option>30/5</option><option>30/4</option>
        <option>30/3</option><option>30/2</option><option>30/1</option><option>30</option>
        <option>15/5</option><option>15/4</option><option>15/3</option><option>15/2</option>
        <option>15/1</option><option>15</option><option>5/6</option><option>4/6</option>
        <option>3/6</option><option>2/6</option><option>1/6</option><option>0</option>
      </select>
    </div>
    <div class="frow" style="margin-bottom:8px">
      <div class="fg"><label>Téléphone</label><input id="reg-phone" placeholder="06 12 34 56 78" type="tel"/></div>
      <div class="fg"><label>Email</label><input id="reg-email" placeholder="email@exemple.com" type="email"/></div>
    </div>
    <!-- Notifications -->
    <div style="background:var(--bg2);border-radius:var(--radius);padding:12px;margin-bottom:1rem">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div>
          <div style="font-size:13px;font-weight:500">🔔 Notifications</div>
          <div style="font-size:12px;color:var(--text2)">Soyez alerté quand vous avez un match à jouer</div>
        </div>
        ${notifGranted
          ? `<span class="pill" style="background:var(--green-bg);color:var(--green);white-space:nowrap">✓ Activées</span>`
          : `<button class="btn btn-sm" onclick="requestNotifications()">Activer</button>`}
      </div>
    </div>
    <button class="btn btn-primary" style="width:100%" onclick="registerPlayer()">S'inscrire au tournoi</button>
  </div></div>`;
}

// ============================================================
//  PUBLIC VIEWS
// ============================================================
function renderPlayersPublic() {
  if (!S.players.length) return `<div class="empty">Aucun joueur inscrit.</div>`;
  return `<div class="grid3">${S.players.map((p,i)=>{const c=ac(i);return`
    <div class="card" style="display:flex;align-items:center;gap:12px">
      <div class="avatar" style="width:40px;height:40px;background:${c.bg};color:${c.txt}">${ini(p.name)}</div>
      <div><div style="font-weight:500;font-size:14px">${p.name}</div>
      <div style="font-size:12px;color:var(--text2)">${p.level||'Non classé'}</div></div>
    </div>`;}).join('')}</div>`;
}

function renderMyMatches() {
  const pid = S.myPlayerId;
  const allMatches = [...S.poolMatches,...S.bracketMatches];
  const rounds = [...new Set(S.bracketMatches.map(m=>m.round))].sort((a,b)=>a-b);
  const total = rounds.length;
  const sel = `<div class="frow" style="margin-bottom:1.25rem">
    <div class="fg" style="max-width:280px"><label>Qui êtes-vous ?</label>
      <select onchange="S.myPlayerId=this.value||null;render()">
        <option value="">— Sélectionnez votre nom</option>
        ${S.players.map(p=>`<option value="${p.id}" ${pid===p.id?'selected':''}>${p.name}</option>`).join('')}
      </select>
    </div>
  </div>`;
  if (!pid) return sel+`<div class="empty">Sélectionnez votre nom pour voir vos matchs.</div>`;
  const myMatches = allMatches.filter(m=>m.p1_id===pid||m.p2_id===pid);
  if (!myMatches.length) return sel+`<div class="empty">Aucun match programmé.</div>`;
  return sel+myMatches.map(m=>{
    const oppId=m.p1_id===pid?m.p2_id:m.p1_id;
    const opp=S.players.find(p=>p.id===oppId);
    const isPool=!!S.poolMatches.find(x=>x.id===m.id);
    const label=isPool?`Poule ${String.fromCharCode(65+(m.pool_index||0))}`:roundName(m.round,total);
    const myScore=m.p1_id===pid?m.score1:m.score2;
    const oppScore=m.p1_id===pid?m.score2:m.score1;
    const iWon=m.done&&m.winner_id===pid;
    const oppWon=m.done&&m.winner_id===oppId;
    const c=ac(opp?S.players.indexOf(opp):0);
    return `<div class="card" style="margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <span class="pill" style="background:var(--bg2);color:var(--text2)">${label}</span>
        ${m.done
          ?`<span class="pill" style="background:${iWon?'var(--green-bg)':'var(--red-bg)'};color:${iWon?'var(--green)':'var(--red)'}">${iWon?'Victoire':'Défaite'}</span>`
          :`<span class="pill" style="background:var(--amber-bg);color:var(--amber)">À jouer</span>`}
      </div>
      ${m.done?`<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:10px 12px;background:var(--bg2);border-radius:var(--radius)">
        <span style="flex:1;font-size:13px;font-weight:${iWon?600:400}">Vous</span>
        <span style="font-size:18px;font-weight:600;letter-spacing:2px">${myScore??'—'} — ${oppScore??'—'}</span>
        <span style="flex:1;font-size:13px;text-align:right;font-weight:${oppWon?600:400}">${opp?opp.name:'?'}</span>
      </div>`:''}
      ${opp?`<div style="display:flex;align-items:center;gap:12px">
        <div class="avatar" style="width:44px;height:44px;background:${c.bg};color:${c.txt};font-size:14px">${ini(opp.name)}</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:14px;margin-bottom:2px">${opp.name}</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:6px">${opp.level||'Non classé'}</div>
          ${opp.phone?`<div style="font-size:13px;margin-bottom:3px"><span style="color:var(--text2);font-size:12px;display:inline-block;min-width:36px">Tél.</span><a href="tel:${opp.phone}" style="color:var(--blue);text-decoration:none">${opp.phone}</a></div>`:''}
          ${opp.email?`<div style="font-size:13px"><span style="color:var(--text2);font-size:12px;display:inline-block;min-width:36px">Email</span><a href="mailto:${opp.email}" style="color:var(--blue);text-decoration:none">${opp.email}</a></div>`:''}
        </div>
      </div>`:`<div style="font-size:13px;color:var(--text2)">Adversaire non encore connu (TBD)</div>`}
    </div>`;
  }).join('');
}

// ============================================================
//  ADMIN VIEWS
// ============================================================
function renderSetup() {
  const t = S.tournament;
  return `<div style="max-width:600px">
    <div class="card">
      <h3>Paramètres</h3>
      <div class="fg" style="margin-bottom:8px"><label>Nom</label>
        <input id="t-name" value="${t.name}" oninput="S.tournament.name=this.value"/></div>
      <div class="frow" style="margin-bottom:8px">
        <div class="fg"><label>Mode</label><select onchange="S.tournament.mode=this.value;render()">
          <option value="simple" ${t.mode==='simple'?'selected':''}>Simple</option>
          <option value="double" ${t.mode==='double'?'selected':''}>Double</option>
        </select></div>
        <div class="fg"><label>Format</label><select onchange="S.tournament.format=this.value;render()">
          <option value="bracket" ${t.format==='bracket'?'selected':''}>Tableau direct</option>
          <option value="pools+bracket" ${t.format==='pools+bracket'?'selected':''}>Poules + Tableau</option>
        </select></div>
      </div>
      <div class="frow" style="margin-bottom:8px">
        <div class="fg"><label>Scores</label><select onchange="S.tournament.score_mode=this.value">
          <option value="both" ${t.score_mode==='both'?'selected':''}>Les deux selon le tour</option>
          <option value="simple" ${t.score_mode==='simple'?'selected':''}>Score simple</option>
          <option value="sets" ${t.score_mode==='sets'?'selected':''}>Par sets</option>
        </select></div>
        <div class="fg"><label>Max joueurs</label>
          <input type="number" value="${t.max_players}" min="4" max="128" oninput="S.tournament.max_players=parseInt(this.value)||16"/></div>
      </div>
      ${t.format==='pools+bracket'?`<div class="frow" style="margin-bottom:8px">
        <div class="fg"><label>Joueurs/poule</label><input type="number" value="${t.pool_size}" min="3" max="8" oninput="S.tournament.pool_size=parseInt(this.value)||4"/></div>
        <div class="fg"><label>Qualifiés/poule</label><input type="number" value="${t.pool_advance}" min="1" max="4" oninput="S.tournament.pool_advance=parseInt(this.value)||2"/></div>
      </div>`:''}
      <button class="btn btn-primary" onclick="saveSettings()">Sauvegarder</button>
    </div>
    <div class="card">
      <h3>Statut & actions</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn ${t.status==='open'?'btn-success':''}" onclick="setStatus('open')">Ouvrir inscriptions</button>
        <button class="btn ${t.status==='closed'?'btn-danger':''}" onclick="setStatus('closed')">Fermer inscriptions</button>
        <button class="btn ${t.status==='running'?'btn-primary':''}" onclick="startTournament()">Lancer le tournoi ▶</button>
        <button class="btn" onclick="setStatus('done')">Clôturer</button>
      </div>
    </div>
    <div class="card">
      <h3>📤 Lien de partage</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <input value="${window.location.origin}/${t.slug}" readonly style="flex:1;background:var(--bg2);font-size:12px;color:var(--text2)"/>
        <button class="btn btn-success" onclick="shareLink('${t.slug}')">Copier</button>
      </div>
      <div style="font-size:12px;color:var(--text2)">Envoyez ce lien dans votre groupe WhatsApp. Vos amis verront une page d'installation avant de s'inscrire.</div>
    </div>
  </div>`;
}

function renderAdminPlayers() {
  return `<div>
    <h2>Ajouter un joueur</h2>
    <div class="frow" style="margin-bottom:8px">
      <div class="fg"><label>Nom</label><input id="ap-name" placeholder="Prénom Nom"/></div>
      <div class="fg"><label>Téléphone</label><input id="ap-phone" placeholder="06…"/></div>
      <div class="fg"><label>Email</label><input id="ap-email" placeholder="email@…"/></div>
      <div class="fg"><label>Classement</label><input id="ap-level" placeholder="15/2…"/></div>
      <button class="btn btn-primary" style="margin-top:18px" onclick="addPlayer()">+ Ajouter</button>
    </div>
    <button class="btn btn-sm" onclick="addSamples()">Ajouter 8 exemples</button>
    <div class="sep"></div>
    ${!S.players.length?`<div class="empty">Aucun joueur.</div>`:`<div class="grid3">${S.players.map((p,i)=>{const c=ac(i);return`
      <div class="card" style="display:flex;align-items:center;gap:10px">
        <div class="avatar" style="width:38px;height:38px;background:${c.bg};color:${c.txt};font-size:12px">${ini(p.name)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:500;font-size:13px">${p.name}</div>
          <div style="font-size:12px;color:var(--text2)">${[p.phone,p.email,p.level].filter(Boolean).join(' · ')||'—'}</div>
        </div>
        <button class="btn btn-sm btn-danger" onclick="removePlayer('${p.id}')">✕</button>
      </div>`;}).join('')}</div>`}
  </div>`;
}

function renderAdminTeams() {
  return `<div>
    <h2>Former une équipe</h2>
    <div class="frow" style="margin-bottom:8px">
      <div class="fg"><label>Joueur 1</label><select id="tp1">${S.players.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select></div>
      <div class="fg"><label>Joueur 2</label><select id="tp2">${S.players.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select></div>
      <div class="fg"><label>Nom équipe</label><input id="tname" placeholder="Les Aces"/></div>
      <button class="btn btn-primary" style="margin-top:18px" onclick="addTeam()">Créer</button>
    </div>
    <button class="btn btn-sm" onclick="autoTeams()">Équipes aléatoires</button>
    <div class="sep"></div>
    ${!S.teams.length?`<div class="empty">Aucune équipe.</div>`:`<div class="grid3">${S.teams.map(t=>{
      const p1=S.players.find(p=>p.id===t.p1_id),p2=S.players.find(p=>p.id===t.p2_id);
      return`<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-weight:500;font-size:13px">${t.name}</span>
          <button class="btn btn-sm btn-danger" onclick="removeTeam('${t.id}')">✕</button>
        </div>
        <div style="font-size:12px;color:var(--text2)">${p1?p1.name:'?'} & ${p2?p2.name:'?'}</div>
      </div>`;}).join('')}</div>`}
  </div>`;
}

function renderPoolsView(admin) {
  if (!S.pools.length) return `<div class="empty">Lance le tournoi pour générer les poules.</div>`;
  return S.pools.map((pool,pi)=>{
    const members=pool.member_ids||[];
    const st=poolStandings(pi,members);
    return `<div style="margin-bottom:2rem">
      <h2>Poule ${String.fromCharCode(65+pi)}</h2>
      <div class="card" style="overflow-x:auto;margin-bottom:1rem">
        <table class="pool-table">
          <tr><th>Joueur/Équipe</th><th>J</th><th>V</th><th>D</th><th>Pts</th><th></th></tr>
          ${st.map((r,i)=>`<tr>
            <td style="font-weight:${i<S.tournament.pool_advance?600:400}">${getEntityName(r.id)}</td>
            <td>${r.played}</td><td style="color:var(--green)">${r.wins}</td>
            <td style="color:var(--red)">${r.losses}</td><td style="font-weight:600">${r.pts}</td>
            <td>${i<S.tournament.pool_advance?`<span class="pill" style="background:var(--green-bg);color:var(--green)">Qualifié</span>`:''}</td>
          </tr>`).join('')}
        </table>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${S.poolMatches.filter(m=>m.pool_index===pi).map(m=>`
          <div class="card" style="padding:.75rem 1rem;display:flex;align-items:center;gap:10px;cursor:${admin?'pointer':'default'}"
            ${admin?`onclick="openMatchModal('pool','${m.id}')"`:''}> 
            <span style="flex:1;font-weight:${m.winner_id===m.p1_id?600:400}">${getEntityName(m.p1_id)}</span>
            <span style="font-size:12px;color:var(--text2);white-space:nowrap">${formatScore(m)}</span>
            <span style="flex:1;text-align:right;font-weight:${m.winner_id===m.p2_id?600:400}">${getEntityName(m.p2_id)}</span>
            ${m.done?`<span class="pill" style="background:var(--green-bg);color:var(--green);font-size:10px">✓</span>`
                    :`<span class="pill" style="background:var(--bg2);color:var(--text2);font-size:10px">À jouer</span>`}
          </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function renderBracketView(admin) {
  if (!S.bracketMatches.length) return `<div class="empty">Lance le tournoi pour générer le tableau.</div>`;
  const rounds=[...new Set(S.bracketMatches.map(m=>m.round))].sort((a,b)=>a-b);
  const total=rounds.length;
  const MATCH_W=170,MATCH_H=64,COL_GAP=48,COL_W=MATCH_W+COL_GAP,LABEL_H=32;
  const firstCount=S.bracketMatches.filter(m=>m.round===0).length;
  const slotPx=MATCH_H+16;
  function centers(ri){
    const count=S.bracketMatches.filter(m=>m.round===ri).length;
    const slotSize=firstCount/count;
    return Array.from({length:count},(_,i)=>(i+0.5)*slotSize*slotPx);
  }
  const svgH=firstCount*slotPx+LABEL_H,svgW=total*COL_W-COL_GAP+4;
  let paths='',cards='';
  for(let r=0;r<total-1;r++){
    const fromC=centers(r),toC=centers(r+1);
    const fromX=r*COL_W+MATCH_W,toX=(r+1)*COL_W,midX=fromX+COL_GAP/2;
    toC.forEach((tY,ti)=>{
      const c1Y=fromC[ti*2]+LABEL_H,c2Y=fromC[ti*2+1]+LABEL_H,ty=tY+LABEL_H;
      paths+=`<path d="M${fromX},${c1Y} H${midX} V${ty} H${toX}" fill="none" stroke="var(--border2)" stroke-width="1"/>`;
      paths+=`<path d="M${fromX},${c2Y} H${midX}" fill="none" stroke="var(--border2)" stroke-width="1"/>`;
    });
  }
  rounds.forEach((r,ri)=>{
    const cs=centers(ri),ms=S.bracketMatches.filter(m=>m.round===r);
    const x=ri*COL_W;
    ms.forEach((m,mi)=>{
      const cy=cs[mi]+LABEL_H,y=cy-MATCH_H/2;
      const w1=m.winner_id===m.p1_id&&m.done,w2=m.winner_id===m.p2_id&&m.done;
      const s1=m.score1!==null&&m.score1!==undefined?m.score1:'';
      const s2=m.score2!==null&&m.score2!==undefined?m.score2:'';
      cards+=`<foreignObject x="${x}" y="${y}" width="${MATCH_W}" height="${MATCH_H}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${MATCH_W}px;height:${MATCH_H}px;border:0.5px solid var(--border2);border-radius:8px;overflow:hidden;background:var(--bg);${admin?'cursor:pointer':''};box-sizing:border-box"
          ${admin?`onclick="openMatchModal('bracket','${m.id}')"`:''}> 
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0 10px;height:50%;font-size:12px;font-family:inherit;border-bottom:0.5px solid var(--border);${w1?'font-weight:600':''}">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;color:${w1?'var(--text)':'var(--text2)'}">${getEntityName(m.p1_id)}</span>
            <span style="font-size:11px;min-width:18px;text-align:right;margin-left:6px;${w1?'background:var(--text);color:var(--bg);border-radius:3px;padding:1px 5px':''}">${s1}</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0 10px;height:50%;font-size:12px;font-family:inherit;${w2?'font-weight:600':''}">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;color:${w2?'var(--text)':'var(--text2)'}">${getEntityName(m.p2_id)}</span>
            <span style="font-size:11px;min-width:18px;text-align:right;margin-left:6px;${w2?'background:var(--text);color:var(--bg);border-radius:3px;padding:1px 5px':''}">${s2}</span>
          </div>
        </div>
      </foreignObject>`;
    });
    cards+=`<text x="${x+MATCH_W/2}" y="${LABEL_H-10}" text-anchor="middle" font-size="10" font-weight="500" fill="var(--text2)" font-family="-apple-system,Helvetica Neue,Arial,sans-serif" letter-spacing="0.06em">${roundName(r,total)}</text>`;
  });
  const wm=S.bracketMatches.find(m=>m.round===total-1&&m.done&&m.winner_id);
  return `${wm?`<div class="winner-banner" style="margin-bottom:1.25rem"><span style="font-size:20px">🏆</span><div><div style="font-size:11px;color:var(--text2)">Vainqueur</div><div style="font-weight:600;font-size:15px">${getEntityName(wm.winner_id)}</div></div></div>`:''}
  <div style="overflow-x:auto;padding-bottom:1rem">
    <svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible">${paths}${cards}</svg>
  </div>
  ${admin?`<p style="font-size:12px;color:var(--text2);margin-top:.5rem">Cliquez sur un match pour saisir le score.</p>`:''}`;
}

function renderStandings() {
  const entities=getEntities();
  if(!entities.length)return`<div class="empty">Aucune donnée.</div>`;
  const all=[...S.poolMatches,...S.bracketMatches];
  const stats=entities.map(e=>{
    const played=all.filter(m=>m.done&&(m.p1_id===e.id||m.p2_id===e.id));
    const wins=played.filter(m=>m.winner_id===e.id).length;
    return{entity:e,played:played.length,wins,losses:played.length-wins,pts:wins*3};
  }).sort((a,b)=>b.pts-a.pts||b.wins-a.wins);
  return`<div class="card"><table class="pool-table">
    <tr><th>#</th><th>Nom</th><th>J</th><th>V</th><th>D</th><th>Pts</th></tr>
    ${stats.map((s,i)=>`<tr>
      <td style="color:var(--text2);font-weight:${i<3?600:400}">${i+1}</td>
      <td style="font-weight:${i===0?600:400}">${s.entity.name}</td>
      <td style="color:var(--text2)">${s.played}</td>
      <td style="color:var(--green)">${s.wins}</td><td style="color:var(--red)">${s.losses}</td>
      <td style="font-weight:600">${s.pts}</td>
    </tr>`).join('')}
  </table></div>`;
}

// ============================================================
//  MODAL SCORE
// ============================================================
function openMatchModal(type,id){S.currentModal={type,id};render();}
function closeModal(){S.currentModal=null;render();}

function renderModal(){
  const m=S.currentModal;
  const arr=m.type==='pool'?S.poolMatches:S.bracketMatches;
  const match=arr.find(x=>x.id===m.id);
  if(!match)return;
  const usesSets=S.tournament.score_mode==='sets'||(S.tournament.score_mode==='both'&&m.type==='bracket'&&match.round>=2);
  const n1=getEntityName(match.p1_id),n2=getEntityName(match.p2_id);
  const sets=match.sets&&match.sets.length?match.sets:[['','']];
  const overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.innerHTML=`<div class="modal">
    <h3>Saisir le score</h3>
    <p class="modal-sub">${n1} vs ${n2}</p>
    ${usesSets?`<div id="sets-container">
      ${sets.map((s,i)=>`<div class="score-row">
        <span style="color:var(--text2);font-size:12px;min-width:44px">Set ${i+1}</span>
        <input type="number" class="sinput" id="s1-${i}" value="${s[0]}" min="0" max="7" placeholder="0"/>
        <span style="color:var(--text2)">—</span>
        <input type="number" class="sinput" id="s2-${i}" value="${s[1]}" min="0" max="7" placeholder="0"/>
      </div>`).join('')}
    </div><button class="btn btn-sm" style="margin-bottom:.75rem" onclick="addSet()">+ Set</button>`
    :`<div class="score-row"><span style="flex:1">${n1}</span>
      <input type="number" class="sinput" id="ms1" value="${match.score1??''}" min="0" placeholder="0"/>
    </div>
    <div class="score-row"><span style="flex:1">${n2}</span>
      <input type="number" class="sinput" id="ms2" value="${match.score2??''}" min="0" placeholder="0"/>
    </div>`}
    <div style="margin-top:12px;padding-top:12px;border-top:0.5px solid var(--border)">
      <div style="font-size:12px;color:var(--text2);margin-bottom:8px">Désigner le vainqueur :</div>
      <div style="display:flex;gap:8px">
        <button class="btn ${match.winner_id===match.p1_id?'btn-success':''}" style="flex:1;justify-content:center"
          onclick="setWinner('${m.type}','${m.id}','p1')">${match.winner_id===match.p1_id?'✓ ':''}${n1}</button>
        <button class="btn ${match.winner_id===match.p2_id?'btn-success':''}" style="flex:1;justify-content:center"
          onclick="setWinner('${m.type}','${m.id}','p2')">${match.winner_id===match.p2_id?'✓ ':''}${n2}</button>
      </div>
    </div>
    <div class="modal-actions">
      ${match.done?`<button class="btn btn-danger" onclick="resetMatch('${m.type}','${m.id}')">Réinitialiser</button>`:''}
      <button class="btn" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveScore('${m.type}','${m.id}',${usesSets})">Valider</button>
    </div>
  </div>`;
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal();});
  document.getElementById('root').appendChild(overlay);
}

function addSet(){
  const cont=document.getElementById('sets-container');if(!cont)return;
  const i=cont.children.length;
  const row=document.createElement('div');row.className='score-row';
  row.innerHTML=`<span style="color:var(--text2);font-size:12px;min-width:44px">Set ${i+1}</span>
    <input type="number" class="sinput" id="s1-${i}" min="0" max="7" placeholder="0"/>
    <span style="color:var(--text2)">—</span>
    <input type="number" class="sinput" id="s2-${i}" min="0" max="7" placeholder="0"/>`;
  cont.appendChild(row);
}

// ============================================================
//  NOTIFICATIONS
// ============================================================
async function requestNotifications() {
  if (!('Notification' in window)) { showToast('Notifications non supportées sur ce navigateur'); return; }
  const perm = await Notification.requestPermission();
  S.notifPermission = perm;
  if (perm === 'granted') {
    await subscribeToPush();
    showToast('Notifications activées ! 🔔');
  } else {
    showToast('Notifications refusées');
  }
  render();
}

async function subscribeToPush() {
  try {
    const reg = window._swRegistration || await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
    // Sauvegarder la souscription en base
    const playerId = S.myPlayerId;
    const userId   = S.user?.id || null;
    await sb.from('push_subscriptions').upsert({
      player_id: playerId || null,
      user_id:   userId,
      subscription: sub.toJSON(),
    });
    return sub;
  } catch (err) {
    console.warn('Push subscribe error:', err);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Appelé après saveScore pour notifier les joueurs concernés
async function notifyMatchPlayers(type, matchId) {
  const arr  = type === 'pool' ? S.poolMatches : S.bracketMatches;
  const match = arr.find(x => x.id === matchId);
  if (!match || !match.p1_id || !match.p2_id) return;

  const rounds = [...new Set(S.bracketMatches.map(m=>m.round))].sort((a,b)=>a-b);
  const label  = type === 'pool'
    ? `Poule ${String.fromCharCode(65 + (match.pool_index || 0))}`
    : roundName(match.round, rounds.length);

  const tournamentUrl = `${window.location.origin}/${S.tournament.slug}`;

  // Récupérer les souscriptions push des deux joueurs
  const [sub1, sub2] = await Promise.all([
    sb.from('push_subscriptions').select('*').eq('player_id', match.p1_id).maybeSingle(),
    sb.from('push_subscriptions').select('*').eq('player_id', match.p2_id).maybeSingle(),
  ]);

  const p1 = S.players.find(p=>p.id===match.p1_id);
  const p2 = S.players.find(p=>p.id===match.p2_id);

  // Appeler l'Edge Function pour chaque joueur
  const calls = [];
  if (p1 && p2) {
    calls.push(sb.functions.invoke('notify-match', { body: {
      player: { ...p1, push_subscription: sub1.data?.subscription || null },
      opponent: p2, tournamentName: S.tournament.name, tournamentUrl, matchLabel: label,
    }}));
    calls.push(sb.functions.invoke('notify-match', { body: {
      player: { ...p2, push_subscription: sub2.data?.subscription || null },
      opponent: p1, tournamentName: S.tournament.name, tournamentUrl, matchLabel: label,
    }}));
  }
  await Promise.allSettled(calls);
}

// ============================================================
//  ACTIONS — AUTH
// ============================================================
function goAuth(){S.page='auth';S.error=null;S.successMsg=null;render();}
function goHome(){S.tournament=null;S.page='home';S.error=null;history.pushState({},'','/');loadMyTournaments().then(render);}
async function goTournament(slug){
  history.pushState({},'','/'+slug);
  S.loading=true;render();
  await loadTournamentBySlug(slug);
  S.loading=false;render();
}

async function submitMagicLink(){
  const email=document.getElementById('auth-email')?.value.trim();
  if(!email){S.error='Veuillez entrer votre email';render();return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){S.error='Adresse email invalide';render();return;}
  S.error=null;
  const {error}=await sb.auth.signInWithOtp({
    email,
    options:{ emailRedirectTo: window.location.origin }
  });
  if(error){
    if(error.message.includes('Too many'))
      S.error='Trop de tentatives. Attendez quelques minutes avant de réessayer.';
    else
      S.error=error.message;
    render();return;
  }
  S.successMsg=`Un lien de connexion a été envoyé à <strong>${email}</strong>. Cliquez dessus pour vous connecter.`;
  render();
}

async function signOut(){await sb.auth.signOut();S.user=null;S.profile=null;S.myTournaments=[];S.page='home';render();}

// ============================================================
//  ACTIONS — TOURNAMENT
// ============================================================
async function createTournament(){
  const name=document.getElementById('c-name')?.value.trim();
  if(!name){S.error='Le nom est requis';render();return;}
  S.error=null;
  const slug=nsl();
  const {data,error}=await sb.from('tournaments').insert({
    owner_id:S.user.id,slug,name,
    mode:document.getElementById('c-mode').value,
    format:document.getElementById('c-format').value,
    score_mode:document.getElementById('c-score').value,
    max_players:parseInt(document.getElementById('c-max').value)||16,
  }).select().single();
  if(error){S.error=error.message;render();return;}
  await loadMyTournaments();
  // Copier le lien auto
  const url=`${window.location.origin}/${slug}`;
  navigator.clipboard.writeText(url).catch(()=>{});
  await goTournament(slug);
  showToast('Tournoi créé ! Lien copié dans le presse-papiers 🎾');
}

async function saveSettings(){
  const t=S.tournament;
  await sb.from('tournaments').update({name:t.name,mode:t.mode,format:t.format,score_mode:t.score_mode,max_players:t.max_players,pool_size:t.pool_size,pool_advance:t.pool_advance}).eq('id',t.id);
  showToast('Paramètres sauvegardés !');
}

async function setStatus(status){
  await sb.from('tournaments').update({status}).eq('id',S.tournament.id);
  S.tournament.status=status;render();
}

function shareLink(slug){
  const url=`${window.location.origin}/${slug}`;
  navigator.clipboard.writeText(url).then(()=>{S.shareToast=true;render();}).catch(()=>{prompt('Copiez ce lien :',url);});
}

// ============================================================
//  ACTIONS — PLAYERS
// ============================================================
async function registerPlayer(){
  const first=document.getElementById('reg-firstname')?.value.trim();
  const last=document.getElementById('reg-lastname')?.value.trim();
  if(!first||!last){alert('Prénom et nom requis');return;}
  const name=`${first} ${last}`;
  if(S.players.length>=S.tournament.max_players){alert('Tournoi complet !');return;}
  if(S.players.find(p=>p.name.toLowerCase()===name.toLowerCase())){alert('Ce joueur est déjà inscrit');return;}
  const {data,error}=await sb.from('players').insert({
    tournament_id:S.tournament.id,name,
    phone:document.getElementById('reg-phone')?.value.trim()||null,
    email:document.getElementById('reg-email')?.value.trim()||null,
    level:document.getElementById('reg-level')?.value||null,
    user_id:S.user?.id||null,
  }).select().single();
  if(error){alert('Erreur: '+error.message);return;}
  S.players.push(data);
  S.myPlayerId=data.id;
  // Souscrire aux push si permission accordée
  if(S.notifPermission==='granted')await subscribeToPush();
  showToast(`${name} inscrit ! 🎾`);
  S.pubTab='matchs';render();
}

async function addPlayer(){
  const name=document.getElementById('ap-name')?.value.trim();
  if(!name)return;
  const {data,error}=await sb.from('players').insert({
    tournament_id:S.tournament.id,name,
    phone:document.getElementById('ap-phone')?.value.trim()||null,
    email:document.getElementById('ap-email')?.value.trim()||null,
    level:document.getElementById('ap-level')?.value||null,
  }).select().single();
  if(error){alert('Erreur: '+error.message);return;}
  S.players.push(data);
  document.getElementById('ap-name').value='';render();
}

async function removePlayer(id){
  await sb.from('players').delete().eq('id',id);
  S.players=S.players.filter(p=>p.id!==id);render();
}

async function addSamples(){
  const samples=[
    {name:'Alice Martin',phone:'06 11 22 33 44',email:'alice@tennis.fr',level:'15/2'},
    {name:'Bob Dupont',phone:'06 55 66 77 88',email:'bob@tennis.fr',level:'30'},
    {name:'Claire Leroy',phone:'07 12 34 56 78',email:'claire@tennis.fr',level:'5/6'},
    {name:'David Moreau',phone:'06 98 76 54 32',email:'david@tennis.fr',level:'15/4'},
    {name:'Emma Petit',phone:'07 23 45 67 89',email:'emma@tennis.fr',level:'NC'},
    {name:'Florian Simon',phone:'06 34 56 78 90',email:'florian@tennis.fr',level:'30/2'},
    {name:'Gaëlle Thomas',phone:'07 45 67 89 01',email:'gaelle@tennis.fr',level:'15/3'},
    {name:'Hugo Blanc',phone:'06 56 78 90 12',email:'hugo@tennis.fr',level:'4/6'},
  ];
  const toAdd=samples.filter(s=>!S.players.find(p=>p.name===s.name)).map(s=>({...s,tournament_id:S.tournament.id}));
  if(!toAdd.length)return;
  const {data}=await sb.from('players').insert(toAdd).select();
  S.players=[...S.players,...(data||[])];render();
}

// ============================================================
//  ACTIONS — TEAMS
// ============================================================
async function addTeam(){
  const p1=document.getElementById('tp1')?.value,p2=document.getElementById('tp2')?.value;
  if(!p1||!p2||p1===p2){alert('Sélectionnez deux joueurs différents');return;}
  const n1=S.players.find(p=>p.id===p1),n2=S.players.find(p=>p.id===p2);
  const name=document.getElementById('tname')?.value.trim()||(n1?n1.name.split(' ')[0]:'')+'/'+( n2?n2.name.split(' ')[0]:'');
  const {data}=await sb.from('teams').insert({tournament_id:S.tournament.id,name,p1_id:p1,p2_id:p2}).select().single();
  S.teams.push(data);document.getElementById('tname').value='';render();
}
async function removeTeam(id){await sb.from('teams').delete().eq('id',id);S.teams=S.teams.filter(t=>t.id!==id);render();}
async function autoTeams(){
  if(S.players.length<2){alert('Ajoutez au moins 2 joueurs');return;}
  await sb.from('teams').delete().eq('tournament_id',S.tournament.id);S.teams=[];
  const sh=[...S.players].sort(()=>Math.random()-.5);
  const newTeams=[];
  for(let i=0;i<Math.floor(sh.length/2);i++){const a=sh[i*2],b=sh[i*2+1];newTeams.push({tournament_id:S.tournament.id,name:a.name.split(' ')[0]+'/'+b.name.split(' ')[0],p1_id:a.id,p2_id:b.id});}
  const {data}=await sb.from('teams').insert(newTeams).select();S.teams=data||[];render();
}

// ============================================================
//  TOURNAMENT START
// ============================================================
async function startTournament(){
  const entities=getEntities();
  if(entities.length<2){alert('Ajoutez au moins 2 '+(S.tournament.mode==='double'?'équipes':'joueurs'));return;}
  S.loading=true;render();
  await Promise.all([
    sb.from('pools').delete().eq('tournament_id',S.tournament.id),
    sb.from('pool_matches').delete().eq('tournament_id',S.tournament.id),
    sb.from('bracket_matches').delete().eq('tournament_id',S.tournament.id),
  ]);
  S.pools=[];S.poolMatches=[];S.bracketMatches=[];
  if(S.tournament.format==='pools+bracket')await generatePools(entities);
  else await generateBracket(entities);
  await setStatus('running');
  S.adminTab=S.tournament.format==='pools+bracket'?'pools':'bracket';
  S.loading=false;render();
  // Notifier tous les joueurs de leur premier match
  if(S.tournament.format==='bracket'){
    for(const m of S.bracketMatches.filter(x=>x.round===0&&x.p1_id&&x.p2_id&&!x.done)){
      await notifyMatchPlayers('bracket',m.id);
    }
  }
}

// ============================================================
//  POOLS
// ============================================================
async function generatePools(entities){
  const sh=[...entities].sort(()=>Math.random()-.5);
  const size=S.tournament.pool_size,numPools=Math.ceil(sh.length/size);
  const poolData=Array.from({length:numPools},(_,i)=>({tournament_id:S.tournament.id,pool_index:i,member_ids:sh.filter((_,j)=>j%numPools===i).map(e=>e.id)}));
  const {data:pools}=await sb.from('pools').insert(poolData).select();S.pools=pools||[];
  const matchData=[];
  S.pools.forEach((pool,pi)=>{const ms=pool.member_ids;for(let i=0;i<ms.length;i++)for(let j=i+1;j<ms.length;j++)matchData.push({tournament_id:S.tournament.id,pool_index:pi,p1_id:ms[i],p2_id:ms[j],done:false});});
  const {data:pm}=await sb.from('pool_matches').insert(matchData).select();S.poolMatches=pm||[];
  // Notifier les joueurs de leurs matchs de poule
  for(const m of S.poolMatches){await notifyMatchPlayers('pool',m.id);}
}

function poolStandings(pi,members){
  return members.map(id=>{
    const played=S.poolMatches.filter(m=>m.pool_index===pi&&m.done&&(m.p1_id===id||m.p2_id===id));
    const wins=played.filter(m=>m.winner_id===id).length;
    return{id,played:played.length,wins,losses:played.length-wins,pts:wins*3};
  }).sort((a,b)=>b.pts-a.pts||b.wins-a.wins);
}

async function checkPoolsDone(){
  if(!S.pools.length)return;
  const allDone=S.pools.every((_,pi)=>S.poolMatches.filter(m=>m.pool_index===pi).every(m=>m.done));
  if(!allDone)return;
  const qualifiers=[];
  S.pools.forEach((pool,pi)=>{poolStandings(pi,pool.member_ids).slice(0,S.tournament.pool_advance).forEach(r=>qualifiers.push(r.id));});
  const qualEntities=qualifiers.map(id=>getEntities().find(e=>e.id===id)).filter(Boolean);
  await sb.from('bracket_matches').delete().eq('tournament_id',S.tournament.id);S.bracketMatches=[];
  await generateBracket(qualEntities);
  S.adminTab='bracket';
  // Notifier les qualifiés
  for(const m of S.bracketMatches.filter(x=>x.round===0&&x.p1_id&&x.p2_id)){await notifyMatchPlayers('bracket',m.id);}
  render();
}

// ============================================================
//  BRACKET
// ============================================================
async function generateBracket(entities){
  let seeds=[...entities].sort(()=>Math.random()-.5);
  let size=1;while(size<seeds.length)size*=2;while(seeds.length<size)seeds.push(null);
  const matchData=[];
  for(let i=0;i<seeds.length;i+=2)matchData.push({tournament_id:S.tournament.id,round:0,position:i/2,p1_id:seeds[i]?.id||null,p2_id:seeds[i+1]?.id||null,done:false});
  const {data:r0}=await sb.from('bracket_matches').insert(matchData).select();S.bracketMatches=r0||[];
  let prev=S.bracketMatches.filter(m=>m.round===0),r=1;
  while(prev.length>1){
    const nextData=[];
    for(let i=0;i<prev.length;i+=2)nextData.push({tournament_id:S.tournament.id,round:r,position:i/2,p1_id:null,p2_id:null,done:false,src1_id:prev[i].id,src2_id:prev[i+1].id});
    const {data:rn}=await sb.from('bracket_matches').insert(nextData).select();S.bracketMatches=[...S.bracketMatches,...(rn||[])];prev=rn||[];r++;
  }
  await propagateByes();
}

async function propagateByes(){
  for(const m of S.bracketMatches){
    if(m.p1_id&&!m.p2_id){await sb.from('bracket_matches').update({winner_id:m.p1_id,done:true}).eq('id',m.id);Object.assign(m,{winner_id:m.p1_id,done:true});}
    if(m.p2_id&&!m.p1_id){await sb.from('bracket_matches').update({winner_id:m.p2_id,done:true}).eq('id',m.id);Object.assign(m,{winner_id:m.p2_id,done:true});}
  }
  await propagateBracket();
}

async function propagateBracket(){
  let changed=true;
  while(changed){
    changed=false;
    for(const m of S.bracketMatches){
      if(!m.src1_id)continue;
      const s1=S.bracketMatches.find(x=>x.id===m.src1_id),s2=S.bracketMatches.find(x=>x.id===m.src2_id);
      let upd={};
      if(s1?.winner_id&&s1.winner_id!==m.p1_id){upd.p1_id=s1.winner_id;changed=true;}
      if(s2?.winner_id&&s2.winner_id!==m.p2_id){upd.p2_id=s2.winner_id;changed=true;}
      if(Object.keys(upd).length){
        await sb.from('bracket_matches').update(upd).eq('id',m.id);Object.assign(m,upd);
        if(m.p1_id&&!m.p2_id&&!m.done){await sb.from('bracket_matches').update({winner_id:m.p1_id,done:true}).eq('id',m.id);Object.assign(m,{winner_id:m.p1_id,done:true});}
        if(m.p2_id&&!m.p1_id&&!m.done){await sb.from('bracket_matches').update({winner_id:m.p2_id,done:true}).eq('id',m.id);Object.assign(m,{winner_id:m.p2_id,done:true});}
        // Notifier le prochain match si les deux joueurs sont connus
        if(m.p1_id&&m.p2_id&&!m.done)await notifyMatchPlayers('bracket',m.id);
      }
    }
  }
}

// ============================================================
//  SCORES
// ============================================================
function setWinner(type,id,which){
  const arr=type==='pool'?S.poolMatches:S.bracketMatches;
  const match=arr.find(x=>x.id===id);if(!match)return;
  const nw=which==='p1'?match.p1_id:match.p2_id;
  match.winner_id=match.winner_id===nw?null:nw;match.done=match.winner_id!==null;
  S.currentModal={type,id};render();
}

async function saveScore(type,id,usesSets){
  const arr=type==='pool'?S.poolMatches:S.bracketMatches;
  const match=arr.find(x=>x.id===id);if(!match)return;
  let upd={};
  if(usesSets){
    const sets=[];let w1=0,w2=0,i=0;
    while(document.getElementById('s1-'+i)){
      const a=parseInt(document.getElementById('s1-'+i).value)||0,b=parseInt(document.getElementById('s2-'+i).value)||0;
      if(a>0||b>0){sets.push([a,b]);if(a>b)w1++;else if(b>a)w2++;}i++;
    }
    if(!sets.length){alert('Entrez au moins un set');return;}
    upd={sets,score1:w1,score2:w2,winner_id:w1>w2?match.p1_id:match.p2_id,done:true};
  } else {
    const s1=parseInt(document.getElementById('ms1')?.value),s2=parseInt(document.getElementById('ms2')?.value);
    const winnerId=match.winner_id||(!isNaN(s1)&&!isNaN(s2)&&s1!==s2?(s1>s2?match.p1_id:match.p2_id):null);
    if(!winnerId){alert('Désignez un vainqueur');return;}
    upd={score1:isNaN(s1)?null:s1,score2:isNaN(s2)?null:s2,winner_id:winnerId,done:true};
  }
  const table=type==='pool'?'pool_matches':'bracket_matches';
  await sb.from(table).update(upd).eq('id',id);Object.assign(match,upd);
  if(type==='pool')await checkPoolsDone();
  if(type==='bracket')await propagateBracket();
  closeModal();
}

async function resetMatch(type,id){
  const table=type==='pool'?'pool_matches':'bracket_matches';
  const upd={score1:null,score2:null,sets:null,winner_id:null,done:false};
  await sb.from(table).update(upd).eq('id',id);
  const arr=type==='pool'?S.poolMatches:S.bracketMatches;
  const match=arr.find(x=>x.id===id);if(match)Object.assign(match,upd);
  closeModal();
}

// ============================================================
//  HELPERS
// ============================================================
function getEntities(){return S.tournament?.mode==='double'?S.teams:S.players;}
function getEntityName(id){
  if(!id)return'TBD';
  if(S.tournament?.mode==='double'){const t=S.teams.find(x=>x.id===id);return t?t.name:'?';}
  const p=S.players.find(x=>x.id===id);return p?p.name:'?';
}
function roundName(r,total){
  if(r===total-1)return'Finale';if(r===total-2)return'Demi-finale';if(r===total-3)return'Quart de finale';return`Tour ${r+1}`;
}
function formatScore(m){
  if(!m.done)return'vs';if(m.sets&&m.sets.length)return m.sets.map(s=>s[0]+'-'+s[1]).join(' ');
  if(m.score1!==null&&m.score1!==undefined)return m.score1+' — '+m.score2;return getEntityName(m.winner_id)+' gagne';
}
function statusLabel(s){return{open:'Inscriptions ouvertes',running:'En cours',done:'Terminé',closed:'Inscriptions fermées'}[s]||s;}

// ============================================================
//  NAVIGATION
// ============================================================
window.addEventListener('popstate',async()=>{
  const s=getSlugFromURL();
  if(s){S.loading=true;render();await loadTournamentBySlug(s);S.loading=false;render();}
  else{S.tournament=null;S.page='home';render();}
});

boot();
