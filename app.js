// ============================================================
//  Tennis Tournament — app.js
//  State-driven vanilla JS single-page app
// ============================================================

// ---- AVATAR COLOR PALETTE ----
const AVATAR_COLORS = [
  { bg: '#E6F1FB', txt: '#0C447C' },
  { bg: '#EAF3DE', txt: '#27500A' },
  { bg: '#EEEDFE', txt: '#3C3489' },
  { bg: '#FAEEDA', txt: '#633806' },
  { bg: '#E1F5EE', txt: '#085041' },
  { bg: '#FBEAF0', txt: '#72243E' },
  { bg: '#FAECE7', txt: '#712B13' },
  { bg: '#F1EFE8', txt: '#444441' },
];

// ============================================================
//  STATE
// ============================================================
let S = {
  view: 'public',       // 'public' | 'admin'
  pubTab: 'register',
  adminTab: 'setup',
  adminLogged: false,
  adminPwd: 'tennis123',
  currentModal: null,   // { type: 'pool'|'bracket', id: number }

  tournament: {
    name: 'Mon Tournoi de Tennis',
    mode: 'simple',           // 'simple' | 'double'
    format: 'bracket',        // 'bracket' | 'pools+bracket'
    status: 'open',           // 'open' | 'closed' | 'running' | 'done'
    poolSize: 4,
    poolAdvance: 2,
    maxPlayers: 16,
    scoreMode: 'both',        // 'simple' | 'sets' | 'both'
  },

  players: [],
  teams: [],
  pools: [],
  poolMatches: [],
  bracketMatches: [],
};

// ============================================================
//  HELPERS
// ============================================================
function uid()  { return Date.now() + Math.floor(Math.random() * 99999); }
function ac(i)  { return AVATAR_COLORS[i % AVATAR_COLORS.length]; }
function ini(n) { return (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'; }

function getName(id) {
  if (!id && id !== 0) return 'TBD';
  if (S.tournament.mode === 'double') {
    const t = S.teams.find(x => x.id === id);
    return t ? t.name : '?';
  }
  const p = S.players.find(x => x.id === id);
  return p ? p.name : '?';
}

function getEntities() {
  return S.tournament.mode === 'double' ? S.teams : S.players;
}

function formatScore(m) {
  if (!m.done) return 'vs';
  if (m.sets && m.sets.length) return m.sets.map(s => s[0] + '-' + s[1]).join('  ');
  if (m.score1 !== null && m.score1 !== undefined) return m.score1 + ' — ' + m.score2;
  return getName(m.winner) + ' gagne';
}

function statusLabel(s) {
  return { open: 'Inscriptions ouvertes', running: 'En cours', done: 'Terminé', closed: 'Inscriptions fermées' }[s] || s;
}

// ============================================================
//  RENDER
// ============================================================
function render() {
  const root = document.getElementById('root');
  root.innerHTML = renderApp();
  if (S.currentModal) renderModal();
}

function renderApp() {
  const t = S.tournament;
  return `
  <div class="app-header">
    <div>
      <h1>${t.name}</h1>
      <div class="app-header-meta">
        <span class="status s-${t.status}">${statusLabel(t.status)}</span>
        <span class="badge">${S.players.length} joueur${S.players.length !== 1 ? 's' : ''}</span>
        <span class="pill ${t.mode === 'double' ? 'pill-double' : 'pill-simple'}">${t.mode === 'double' ? 'Double' : 'Simple'}</span>
        <span class="pill" style="background:var(--bg2);color:var(--text2)">${t.format === 'pools+bracket' ? 'Poules + Tableau' : 'Tableau direct'}</span>
      </div>
    </div>
    <div style="display:flex;gap:6px;margin-top:4px">
      ${S.view === 'public'
        ? `<button class="btn" onclick="switchView('admin')">Admin</button>`
        : `<button class="btn" onclick="switchView('public')">Vue joueur</button>`}
    </div>
  </div>
  ${S.view === 'public' ? renderPublic() : renderAdmin()}`;
}

// ---- PUBLIC ----
function renderPublic() {
  const tabs = [
    { id: 'register', label: 'Inscription' },
    { id: 'bracket',  label: 'Tableau' },
    ...(S.tournament.format === 'pools+bracket' ? [{ id: 'pools', label: 'Poules' }] : []),
    { id: 'players',  label: 'Joueurs' },
  ];
  return `
  <div class="tab-bar">${tabs.map(t => `
    <button class="tab ${S.pubTab === t.id ? 'active' : ''}" onclick="setPubTab('${t.id}')">${t.label}</button>`).join('')}
  </div>
  ${{ register: renderRegister, bracket: () => renderBracketView(false), pools: () => renderPoolsView(false), players: renderPlayersPublic }[S.pubTab]?.() || ''}`;
}

function renderRegister() {
  if (S.tournament.status !== 'open') {
    return `<div class="empty">Les inscriptions sont ${S.tournament.status === 'running' ? 'fermées — le tournoi est en cours' : 'fermées'}.</div>`;
  }
  return `
  <div class="reg-card">
    <div class="card">
      <h3>S'inscrire au tournoi</h3>
      <div class="fg" style="margin-bottom:8px">
        <label>Prénom & Nom *</label>
        <input id="reg-name" placeholder="Rafael Nadal" />
      </div>
      <div class="frow" style="margin-bottom:8px">
        <div class="fg"><label>Téléphone</label><input id="reg-phone" placeholder="06 12 34 56 78" /></div>
        <div class="fg"><label>Email</label><input id="reg-email" placeholder="email@exemple.com" /></div>
      </div>
      <div class="fg" style="margin-bottom:1rem">
        <label>Niveau</label>
        <select id="reg-level">
          <option value="">— Non renseigné</option>
          <option>Débutant</option><option>Intermédiaire</option><option>Avancé</option><option>Compétition</option>
        </select>
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="registerPlayer()">S'inscrire</button>
    </div>
  </div>`;
}

function renderPlayersPublic() {
  if (!S.players.length) return `<div class="empty">Aucun joueur inscrit pour l'instant.</div>`;
  return `<div class="grid3">${S.players.map((p, i) => {
    const c = ac(i);
    return `<div class="card" style="display:flex;align-items:center;gap:12px">
      <div class="avatar" style="width:40px;height:40px;background:${c.bg};color:${c.txt}">${ini(p.name)}</div>
      <div>
        <div style="font-weight:500;font-size:14px">${p.name}</div>
        <div style="font-size:12px;color:var(--text2)">${p.level || 'Niveau non renseigné'}</div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

// ---- ADMIN ----
function renderAdmin() {
  if (!S.adminLogged) return renderAdminLogin();
  const tabs = [
    { id: 'setup',     label: 'Configuration' },
    { id: 'players',   label: 'Joueurs' },
    ...(S.tournament.mode === 'double'           ? [{ id: 'teams',    label: 'Équipes' }]  : []),
    ...(S.tournament.format === 'pools+bracket'  ? [{ id: 'pools',    label: 'Poules' }]   : []),
    { id: 'bracket',   label: 'Tableau' },
    { id: 'standings', label: 'Classement' },
  ];
  const renders = {
    setup: renderSetup, players: renderAdminPlayers, teams: renderAdminTeams,
    pools: () => renderPoolsView(true), bracket: () => renderBracketView(true), standings: renderStandings,
  };
  return `
  <div class="tab-bar">${tabs.map(t => `
    <button class="tab ${S.adminTab === t.id ? 'active' : ''}" onclick="setAdminTab('${t.id}')">${t.label}</button>`).join('')}
  </div>
  ${renders[S.adminTab]?.() || ''}`;
}

function renderAdminLogin() {
  return `
  <div style="max-width:340px;margin:0 auto">
    <div class="card">
      <h3>Accès administrateur</h3>
      <div class="fg" style="margin-bottom:8px">
        <label>Mot de passe</label>
        <input type="password" id="apwd" placeholder="••••••••" onkeydown="if(event.key==='Enter')adminLogin()" />
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="adminLogin()">Connexion</button>
      <p style="font-size:12px;color:var(--text2);margin-top:8px;text-align:center">Mot de passe par défaut : tennis123</p>
    </div>
  </div>`;
}

function renderSetup() {
  const t = S.tournament;
  return `
  <div style="max-width:600px">
    <div class="card">
      <h3>Paramètres généraux</h3>
      <div class="fg" style="margin-bottom:8px">
        <label>Nom du tournoi</label>
        <input id="t-name" value="${t.name}" oninput="S.tournament.name=this.value;document.querySelector('h1').textContent=this.value" />
      </div>
      <div class="frow" style="margin-bottom:8px">
        <div class="fg">
          <label>Mode</label>
          <select onchange="S.tournament.mode=this.value;render()">
            <option value="simple" ${t.mode === 'simple' ? 'selected' : ''}>Simple (1v1)</option>
            <option value="double" ${t.mode === 'double' ? 'selected' : ''}>Double (2v2)</option>
          </select>
        </div>
        <div class="fg">
          <label>Format</label>
          <select onchange="S.tournament.format=this.value;render()">
            <option value="bracket"       ${t.format === 'bracket'       ? 'selected' : ''}>Tableau direct</option>
            <option value="pools+bracket" ${t.format === 'pools+bracket' ? 'selected' : ''}>Poules + Tableau</option>
          </select>
        </div>
      </div>
      <div class="frow" style="margin-bottom:8px">
        <div class="fg">
          <label>Saisie des scores</label>
          <select onchange="S.tournament.scoreMode=this.value">
            <option value="simple" ${t.scoreMode === 'simple' ? 'selected' : ''}>Score simple</option>
            <option value="sets"   ${t.scoreMode === 'sets'   ? 'selected' : ''}>Par sets</option>
            <option value="both"   ${t.scoreMode === 'both'   ? 'selected' : ''}>Les deux selon le tour</option>
          </select>
        </div>
        <div class="fg">
          <label>Max joueurs</label>
          <input type="number" value="${t.maxPlayers}" min="4" max="128" oninput="S.tournament.maxPlayers=parseInt(this.value)||16" />
        </div>
      </div>
      ${t.format === 'pools+bracket' ? `
      <div class="frow" style="margin-bottom:8px">
        <div class="fg">
          <label>Joueurs par poule</label>
          <input type="number" value="${t.poolSize}" min="3" max="8" oninput="S.tournament.poolSize=parseInt(this.value)||4" />
        </div>
        <div class="fg">
          <label>Qualifiés par poule</label>
          <input type="number" value="${t.poolAdvance}" min="1" max="4" oninput="S.tournament.poolAdvance=parseInt(this.value)||2" />
        </div>
      </div>` : ''}
    </div>

    <div class="card">
      <h3>Statut & actions</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn ${t.status === 'open'   ? 'btn-success' : ''}" onclick="setStatus('open')">Ouvrir inscriptions</button>
        <button class="btn ${t.status === 'closed' ? 'btn-danger'  : ''}" onclick="setStatus('closed')">Fermer inscriptions</button>
        <button class="btn ${t.status === 'running'? 'btn-primary' : ''}" onclick="startTournament()">Lancer le tournoi ▶</button>
        <button class="btn" onclick="setStatus('done')">Clôturer</button>
      </div>
    </div>

    <div class="card">
      <h3>Sécurité</h3>
      <div class="frow">
        <div class="fg"><label>Nouveau mot de passe admin</label><input type="password" id="new-pwd" placeholder="Nouveau mot de passe" /></div>
        <button class="btn" onclick="changePwd()" style="margin-top:18px">Modifier</button>
      </div>
    </div>
  </div>`;
}

function renderAdminPlayers() {
  return `
  <div>
    <h2>Ajouter un joueur</h2>
    <div class="frow" style="margin-bottom:8px">
      <div class="fg"><label>Nom</label><input id="ap-name" placeholder="Prénom Nom" /></div>
      <div class="fg"><label>Téléphone</label><input id="ap-phone" placeholder="06…" /></div>
      <div class="fg"><label>Email</label><input id="ap-email" placeholder="email@…" /></div>
      <div class="fg">
        <label>Niveau</label>
        <select id="ap-level">
          <option value="">—</option>
          <option>Débutant</option><option>Intermédiaire</option><option>Avancé</option><option>Compétition</option>
        </select>
      </div>
      <button class="btn btn-primary" style="margin-top:18px" onclick="addPlayer()">+ Ajouter</button>
    </div>
    <button class="btn btn-sm" onclick="addSamples()">Ajouter 8 exemples</button>
    <div class="sep"></div>
    ${!S.players.length
      ? `<div class="empty">Aucun joueur — commencez par en ajouter.</div>`
      : `<div class="grid3">${S.players.map((p, i) => {
          const c = ac(i);
          return `<div class="card" style="display:flex;align-items:center;gap:10px">
            <div class="avatar" style="width:38px;height:38px;background:${c.bg};color:${c.txt}">${ini(p.name)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:500;font-size:13px">${p.name}</div>
              <div style="font-size:12px;color:var(--text2)">${[p.phone, p.email, p.level].filter(Boolean).join(' · ') || '—'}</div>
            </div>
            <button class="btn btn-sm btn-danger" onclick="removePlayer(${p.id})">✕</button>
          </div>`;
        }).join('')}</div>`}
  </div>`;
}

function renderAdminTeams() {
  const avail = S.players;
  return `
  <div>
    <h2>Former une équipe</h2>
    <div class="frow" style="margin-bottom:8px">
      <div class="fg"><label>Joueur 1</label><select id="tp1">${avail.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select></div>
      <div class="fg"><label>Joueur 2</label><select id="tp2">${avail.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select></div>
      <div class="fg"><label>Nom d'équipe (optionnel)</label><input id="tname" placeholder="Les Aces" /></div>
      <button class="btn btn-primary" style="margin-top:18px" onclick="addTeam()">Créer</button>
    </div>
    <button class="btn btn-sm" onclick="autoTeams()">Équipes aléatoires</button>
    <div class="sep"></div>
    ${!S.teams.length
      ? `<div class="empty">Aucune équipe formée.</div>`
      : `<div class="grid3">${S.teams.map((t, i) => {
          const p1 = S.players.find(p => p.id === t.p1);
          const p2 = S.players.find(p => p.id === t.p2);
          return `<div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-weight:500;font-size:13px">${t.name}</span>
              <button class="btn btn-sm btn-danger" onclick="removeTeam(${t.id})">✕</button>
            </div>
            <div style="font-size:12px;color:var(--text2)">${p1 ? p1.name : '?'} &amp; ${p2 ? p2.name : '?'}</div>
          </div>`;
        }).join('')}</div>`}
  </div>`;
}

function renderPoolsView(admin) {
  if (!S.pools.length) {
    return `<div class="empty">Lance le tournoi depuis Configuration pour générer les poules.</div>`;
  }
  return S.pools.map((pool, pi) => `
    <div style="margin-bottom:2rem">
      <h2>Poule ${String.fromCharCode(65 + pi)}</h2>
      <div class="card" style="overflow-x:auto;margin-bottom:1rem">
        <table class="pool-table">
          <tr><th>Joueur/Équipe</th><th>J</th><th>V</th><th>D</th><th>Pts</th><th></th></tr>
          ${poolStandings(pi).map((r, i) => `<tr>
            <td style="font-weight:${i < S.tournament.poolAdvance ? 600 : 400}">${getName(r.id)}</td>
            <td>${r.played}</td>
            <td style="color:var(--green)">${r.wins}</td>
            <td style="color:var(--red)">${r.losses}</td>
            <td style="font-weight:600">${r.pts}</td>
            <td>${i < S.tournament.poolAdvance ? `<span class="pill" style="background:var(--green-bg);color:var(--green)">Qualifié</span>` : ''}</td>
          </tr>`).join('')}
        </table>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${S.poolMatches.filter(m => m.pool === pi).map(m => `
          <div class="card match-row" ${admin ? `onclick="openMatchModal('pool',${m.id})"` : ''}>
            <span style="flex:1;font-weight:${m.winner === m.p1 ? 600 : 400}">${getName(m.p1)}</span>
            <span style="font-size:12px;color:var(--text2);white-space:nowrap">${formatScore(m)}</span>
            <span style="flex:1;text-align:right;font-weight:${m.winner === m.p2 ? 600 : 400}">${getName(m.p2)}</span>
            ${m.done
              ? `<span class="pill" style="background:var(--green-bg);color:var(--green);font-size:10px">✓</span>`
              : `<span class="pill" style="background:var(--bg2);color:var(--text2);font-size:10px">À jouer</span>`}
          </div>`).join('')}
      </div>
    </div>`).join('');
}

function renderBracketView(admin) {
  if (!S.bracketMatches.length) {
    return `<div class="empty">Lance le tournoi pour générer le tableau.</div>`;
  }
  const rounds = [...new Set(S.bracketMatches.map(m => m.round))].sort((a, b) => a - b);
  const total   = rounds.length;
  const roundName = r => {
    if (r === total - 1) return 'Finale';
    if (r === total - 2) return 'Demi-finale';
    if (r === total - 3) return 'Quart de finale';
    return `Tour ${r + 1}`;
  };
  const winner = S.bracketMatches.find(m => m.round === total - 1 && m.done && m.winner);

  return `
  <div class="bracket-scroll">
    ${winner ? `
    <div class="winner-banner">
      <span style="font-size:20px">🏆</span>
      <div>
        <div style="font-size:11px;color:var(--text2)">Vainqueur</div>
        <div style="font-weight:600;font-size:15px">${getName(winner.winner)}</div>
      </div>
    </div>` : ''}
    <div class="bracket">
      ${rounds.map((r, ri) => {
        const ms = S.bracketMatches.filter(m => m.round === r);
        const spacing = Math.pow(2, r);
        return `
        <div class="b-round">
          <div class="b-rtitle">${roundName(r)}</div>
          <div class="b-matches" style="gap:${spacing * 14}px">
            ${ms.map(m => `
            <div class="b-match" ${admin ? `onclick="openMatchModal('bracket',${m.id})"` : ''}>
              <div class="b-player ${m.winner === m.p1 && m.done ? 'win' : ''}">
                <span class="bname">${getName(m.p1)}</span>
                <span class="bscore">${m.score1 !== null && m.score1 !== undefined ? m.score1 : ''}</span>
              </div>
              <div class="b-player ${m.winner === m.p2 && m.done ? 'win' : ''}">
                <span class="bname">${getName(m.p2)}</span>
                <span class="bscore">${m.score2 !== null && m.score2 !== undefined ? m.score2 : ''}</span>
              </div>
            </div>`).join('')}
          </div>
        </div>
        ${ri < rounds.length - 1 ? `<div style="width:20px;border-top:0.5px solid var(--border);margin-top:${spacing * 14 / 2 + 24}px;align-self:flex-start"></div>` : ''}`;
      }).join('')}
    </div>
  </div>`;
}

function renderStandings() {
  const entities = getEntities();
  if (!entities.length) return `<div class="empty">Aucune donnée disponible.</div>`;
  const allMatches = [...S.poolMatches, ...S.bracketMatches];
  const stats = entities.map(e => {
    const played = allMatches.filter(m => m.done && (m.p1 === e.id || m.p2 === e.id));
    const wins   = played.filter(m => m.winner === e.id).length;
    return { entity: e, played: played.length, wins, losses: played.length - wins, pts: wins * 3 };
  }).sort((a, b) => b.pts - a.pts || b.wins - a.wins);

  return `
  <div class="card">
    <table class="pool-table">
      <tr><th>#</th><th>Nom</th><th>J</th><th>V</th><th>D</th><th>Pts</th></tr>
      ${stats.map((s, i) => `<tr>
        <td style="color:var(--text2);font-weight:${i < 3 ? 600 : 400}">${i + 1}</td>
        <td style="font-weight:${i === 0 ? 600 : 400}">${s.entity.name}</td>
        <td style="color:var(--text2)">${s.played}</td>
        <td style="color:var(--green)">${s.wins}</td>
        <td style="color:var(--red)">${s.losses}</td>
        <td style="font-weight:600">${s.pts}</td>
      </tr>`).join('')}
    </table>
  </div>`;
}

// ============================================================
//  MODAL
// ============================================================
function openMatchModal(type, id) { S.currentModal = { type, id }; render(); }

function closeModal() { S.currentModal = null; render(); }

function renderModal() {
  const m = S.currentModal;
  const arr   = m.type === 'pool' ? S.poolMatches : S.bracketMatches;
  const match = arr.find(x => x.id === m.id);
  if (!match) return;

  // Determine score mode for this specific match
  const usesSets = S.tournament.scoreMode === 'sets' ||
    (S.tournament.scoreMode === 'both' && m.type === 'bracket' && match.round >= 2);

  const n1   = getName(match.p1);
  const n2   = getName(match.p2);
  const sets  = match.sets && match.sets.length ? match.sets : [['', '']];

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
  <div class="modal">
    <h3>Saisir le score</h3>
    <p class="modal-sub">${n1} vs ${n2}</p>
    ${usesSets ? `
      <div id="sets-container">
        ${sets.map((s, i) => `
        <div class="score-row" id="set-row-${i}">
          <span style="color:var(--text2);font-size:12px;min-width:44px">Set ${i + 1}</span>
          <input type="number" class="sinput" id="s1-${i}" value="${s[0]}" min="0" max="7" placeholder="0" />
          <span style="color:var(--text2)">—</span>
          <input type="number" class="sinput" id="s2-${i}" value="${s[1]}" min="0" max="7" placeholder="0" />
        </div>`).join('')}
      </div>
      <button class="btn btn-sm" style="margin-bottom:.75rem" onclick="addSet()">+ Set</button>
    ` : `
      <div class="score-row">
        <span style="flex:1">${n1}</span>
        <input type="number" class="sinput" id="ms1" value="${match.score1 !== null && match.score1 !== undefined ? match.score1 : ''}" min="0" placeholder="0" />
      </div>
      <div class="score-row">
        <span style="flex:1">${n2}</span>
        <input type="number" class="sinput" id="ms2" value="${match.score2 !== null && match.score2 !== undefined ? match.score2 : ''}" min="0" placeholder="0" />
      </div>
    `}
    <div class="modal-actions">
      ${match.done ? `<button class="btn btn-danger" onclick="resetMatch('${m.type}',${m.id})">Réinitialiser</button>` : ''}
      <button class="btn" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveScore('${m.type}',${m.id},${usesSets})">Valider</button>
    </div>
  </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.getElementById('root').appendChild(overlay);
}

function addSet() {
  const cont = document.getElementById('sets-container');
  if (!cont) return;
  const i = cont.children.length;
  const row = document.createElement('div');
  row.className = 'score-row'; row.id = 'set-row-' + i;
  row.innerHTML = `
    <span style="color:var(--text2);font-size:12px;min-width:44px">Set ${i + 1}</span>
    <input type="number" class="sinput" id="s1-${i}" min="0" max="7" placeholder="0" />
    <span style="color:var(--text2)">—</span>
    <input type="number" class="sinput" id="s2-${i}" min="0" max="7" placeholder="0" />`;
  cont.appendChild(row);
}

function saveScore(type, id, usesSets) {
  const arr   = type === 'pool' ? S.poolMatches : S.bracketMatches;
  const match = arr.find(x => x.id === id);
  if (!match) return;

  if (usesSets) {
    const sets = []; let w1 = 0, w2 = 0, i = 0;
    while (document.getElementById('s1-' + i)) {
      const a = parseInt(document.getElementById('s1-' + i).value) || 0;
      const b = parseInt(document.getElementById('s2-' + i).value) || 0;
      if (a > 0 || b > 0) { sets.push([a, b]); if (a > b) w1++; else if (b > a) w2++; }
      i++;
    }
    if (!sets.length) { alert('Entrez au moins un set'); return; }
    match.sets = sets; match.score1 = w1; match.score2 = w2;
    match.winner = w1 > w2 ? match.p1 : match.p2;
  } else {
    const s1 = parseInt(document.getElementById('ms1').value);
    const s2 = parseInt(document.getElementById('ms2').value);
    if (isNaN(s1) || isNaN(s2)) { alert('Score invalide'); return; }
    if (s1 === s2) { alert('Pas de match nul — un vainqueur doit être désigné'); return; }
    match.score1 = s1; match.score2 = s2;
    match.winner = s1 > s2 ? match.p1 : match.p2;
  }
  match.done = true;
  if (type === 'pool') propagatePoolToQuals();
  if (type === 'bracket') propagateBracket();
  closeModal();
}

function resetMatch(type, id) {
  const arr   = type === 'pool' ? S.poolMatches : S.bracketMatches;
  const match = arr.find(x => x.id === id);
  if (!match) return;
  Object.assign(match, { score1: null, score2: null, sets: null, winner: null, done: false });
  closeModal();
}

// ============================================================
//  ACTIONS — PLAYERS / TEAMS
// ============================================================
function registerPlayer() {
  const name = document.getElementById('reg-name').value.trim();
  if (!name) { alert('Le nom est requis'); return; }
  if (S.players.length >= S.tournament.maxPlayers) { alert('Tournoi complet !'); return; }
  if (S.players.find(p => p.name.toLowerCase() === name.toLowerCase())) { alert('Ce joueur est déjà inscrit'); return; }
  S.players.push({
    id: uid(), name,
    phone: document.getElementById('reg-phone').value.trim(),
    email: document.getElementById('reg-email').value.trim(),
    level: document.getElementById('reg-level').value,
  });
  alert(name + ' inscrit avec succès !');
  render();
}

function addPlayer() {
  const name = document.getElementById('ap-name').value.trim();
  if (!name) return;
  S.players.push({
    id: uid(), name,
    phone: document.getElementById('ap-phone').value.trim(),
    email: document.getElementById('ap-email').value.trim(),
    level: document.getElementById('ap-level').value,
  });
  document.getElementById('ap-name').value = '';
  render();
}

function removePlayer(id) { S.players = S.players.filter(p => p.id !== id); render(); }

function addSamples() {
  const samples = [
    { name: 'Alice Martin',   phone: '06 11 22 33 44', email: 'alice@tennis.fr',   level: 'Avancé' },
    { name: 'Bob Dupont',     phone: '06 55 66 77 88', email: 'bob@tennis.fr',     level: 'Intermédiaire' },
    { name: 'Claire Leroy',   phone: '07 12 34 56 78', email: 'claire@tennis.fr',  level: 'Compétition' },
    { name: 'David Moreau',   phone: '06 98 76 54 32', email: 'david@tennis.fr',   level: 'Avancé' },
    { name: 'Emma Petit',     phone: '07 23 45 67 89', email: 'emma@tennis.fr',    level: 'Débutant' },
    { name: 'Florian Simon',  phone: '06 34 56 78 90', email: 'florian@tennis.fr', level: 'Intermédiaire' },
    { name: 'Gaëlle Thomas',  phone: '07 45 67 89 01', email: 'gaelle@tennis.fr',  level: 'Avancé' },
    { name: 'Hugo Blanc',     phone: '06 56 78 90 12', email: 'hugo@tennis.fr',    level: 'Compétition' },
  ];
  samples.forEach(s => {
    if (!S.players.find(p => p.name === s.name)) S.players.push({ id: uid(), ...s });
  });
  render();
}

function addTeam() {
  const p1 = parseInt(document.getElementById('tp1').value);
  const p2 = parseInt(document.getElementById('tp2').value);
  if (!p1 || !p2 || p1 === p2) { alert('Sélectionnez deux joueurs différents'); return; }
  const n1 = S.players.find(p => p.id === p1);
  const n2 = S.players.find(p => p.id === p2);
  const name = document.getElementById('tname').value.trim() ||
    (n1 ? n1.name.split(' ')[0] : '') + '/' + (n2 ? n2.name.split(' ')[0] : '');
  S.teams.push({ id: uid(), name, p1, p2 });
  document.getElementById('tname').value = '';
  render();
}

function removeTeam(id) { S.teams = S.teams.filter(t => t.id !== id); render(); }

function autoTeams() {
  if (S.players.length < 2) { alert('Ajoutez au moins 2 joueurs'); return; }
  S.teams = [];
  const shuffled = [...S.players].sort(() => Math.random() - 0.5);
  for (let i = 0; i < Math.floor(shuffled.length / 2); i++) {
    const a = shuffled[i * 2], b = shuffled[i * 2 + 1];
    S.teams.push({ id: uid(), name: a.name.split(' ')[0] + '/' + b.name.split(' ')[0], p1: a.id, p2: b.id });
  }
  render();
}

// ============================================================
//  TOURNAMENT LIFECYCLE
// ============================================================
function setStatus(s) { S.tournament.status = s; render(); }

function changePwd() {
  const v = document.getElementById('new-pwd').value.trim();
  if (v.length < 4) { alert('Mot de passe trop court (min. 4 caractères)'); return; }
  S.adminPwd = v;
  alert('Mot de passe modifié');
}

function adminLogin() {
  const v = document.getElementById('apwd').value;
  if (v === S.adminPwd) { S.adminLogged = true; S.adminTab = 'setup'; render(); }
  else { alert('Mot de passe incorrect'); }
}

function switchView(v) { S.view = v; render(); }
function setPubTab(t)   { S.pubTab = t;    render(); }
function setAdminTab(t) { S.adminTab = t;  render(); }

function startTournament() {
  const entities = getEntities();
  if (entities.length < 2) {
    alert('Ajoutez au moins 2 ' + (S.tournament.mode === 'double' ? 'équipes' : 'joueurs'));
    return;
  }
  S.tournament.status = 'running';
  S.pools = []; S.poolMatches = []; S.bracketMatches = [];
  if (S.tournament.format === 'pools+bracket') generatePools(entities);
  else generateBracket(entities);
  S.adminTab = S.tournament.format === 'pools+bracket' ? 'pools' : 'bracket';
  render();
}

// ============================================================
//  POOLS
// ============================================================
function generatePools(entities) {
  const shuffled = [...entities].sort(() => Math.random() - 0.5);
  const size     = S.tournament.poolSize;
  const numPools = Math.ceil(shuffled.length / size);
  S.pools = Array.from({ length: numPools }, () => ({ members: [] }));
  shuffled.forEach((e, i) => S.pools[i % numPools].members.push(e.id));

  S.poolMatches = [];
  S.pools.forEach((pool, pi) => {
    const ms = pool.members;
    for (let i = 0; i < ms.length; i++)
      for (let j = i + 1; j < ms.length; j++)
        S.poolMatches.push({ id: uid(), pool: pi, p1: ms[i], p2: ms[j], score1: null, score2: null, winner: null, done: false });
  });
}

function poolStandings(pi) {
  return S.pools[pi].members.map(id => {
    const played = S.poolMatches.filter(m => m.pool === pi && m.done && (m.p1 === id || m.p2 === id));
    const wins   = played.filter(m => m.winner === id).length;
    return { id, played: played.length, wins, losses: played.length - wins, pts: wins * 3 };
  }).sort((a, b) => b.pts - a.pts || b.wins - a.wins);
}

function propagatePoolToQuals() {
  const allDone = S.pools.every((_, pi) => S.poolMatches.filter(m => m.pool === pi).every(m => m.done));
  if (!allDone) return;
  const qualifiers = [];
  S.pools.forEach((_, pi) => {
    poolStandings(pi).slice(0, S.tournament.poolAdvance).forEach(r => qualifiers.push(r.id));
  });
  const qualEntities = qualifiers.map(id => getEntities().find(e => e.id === id)).filter(Boolean);
  generateBracket(qualEntities);
  S.adminTab = 'bracket';
  render();
}

// ============================================================
//  BRACKET
// ============================================================
function generateBracket(entities) {
  let seeds = [...entities].sort(() => Math.random() - 0.5);
  let size  = 1;
  while (size < seeds.length) size *= 2;
  while (seeds.length < size) seeds.push(null);

  S.bracketMatches = [];
  let mid = uid();
  for (let i = 0; i < seeds.length; i += 2) {
    S.bracketMatches.push({
      id: mid++, round: 0,
      p1: seeds[i]     ? seeds[i].id     : null,
      p2: seeds[i + 1] ? seeds[i + 1].id : null,
      score1: null, score2: null, winner: null, done: false,
    });
  }

  let prev = S.bracketMatches.filter(m => m.round === 0), r = 1;
  while (prev.length > 1) {
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push({
        id: mid++, round: r,
        p1: null, p2: null,
        score1: null, score2: null, winner: null, done: false,
        src1: prev[i].id, src2: prev[i + 1].id,
      });
    }
    S.bracketMatches = S.bracketMatches.concat(next);
    prev = next; r++;
  }
  propagateByes();
}

function propagateByes() {
  S.bracketMatches.forEach(m => {
    if (m.p1 !== null && m.p2 === null) { m.winner = m.p1; m.done = true; }
    if (m.p2 !== null && m.p1 === null) { m.winner = m.p2; m.done = true; }
    if (m.p1 === null && m.p2 === null) { m.done = true; }
  });
  propagateBracket();
}

function propagateBracket() {
  let changed = true;
  while (changed) {
    changed = false;
    S.bracketMatches.forEach(m => {
      if (m.src1 === undefined) return;
      const s1 = S.bracketMatches.find(x => x.id === m.src1);
      const s2 = S.bracketMatches.find(x => x.id === m.src2);
      if (s1 && s1.winner !== undefined && s1.winner !== m.p1) { m.p1 = s1.winner; changed = true; }
      if (s2 && s2.winner !== undefined && s2.winner !== m.p2) { m.p2 = s2.winner; changed = true; }
      if (m.p1 !== null && m.p2 === null && !m.done) { m.winner = m.p1; m.done = true; changed = true; }
      if (m.p2 !== null && m.p1 === null && !m.done) { m.winner = m.p2; m.done = true; changed = true; }
    });
  }
}

// ============================================================
//  BOOT
// ============================================================
render();
