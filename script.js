// ===== FAMILY SCHEDULE APP — Enhanced v2 =====

// ===== Firebase Configuration =====
const firebaseConfig = {
  apiKey: "AIzaSyD9IzSor82cM39XgdLbywBdq-bM8m2c_ak",
  authDomain: "mykids-3f832.firebaseapp.com",
  projectId: "mykids-3f832",
  storageBucket: "mykids-3f832.firebasestorage.app",
  messagingSenderId: "869870400492",
  appId: "1:869870400492:web:80200b8102afb53e1c06c9",
  measurementId: "G-Q3X18J3SJ4",
  databaseURL: "https://mykids-3f832-default-rtdb.firebaseio.com"
};

// ===== Initialize Firebase =====
const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
const db   = firebase.database();
const auth = firebase.auth();

const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ===== Kid color palette (fixed by index) =====
const KID_COLORS = ['#6366f1','#f43f5e','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#14b8a6'];

function getKidColor(index) {
    return KID_COLORS[index % KID_COLORS.length];
}

function getInitials(name = '') {
    return name.trim().slice(0, 2) || '?';
}

// ===== Global State =====
let userKidsRef      = null;
let userSettingsRef  = null;
let currentView      = 'daily';
let activeFilters    = ['regular','transport','recurring','permanent'];
let appSettings      = { title: 'הלוח שלי', entityName: 'פעילות', defaultView: 'daily' };
let isTimelineVisible = true;
let kidsColorMap     = {};   // kidId → color
let kidsIndexMap     = {};   // kidId → index

// ===== Utilities =====
const todayStr = () => new Date().toISOString().slice(0, 10);

function el(id) { return document.getElementById(id); }

function formatTimeRange(start, end) {
    if (!start) return '––';
    if (!end)   return start;
    return `${start}–${end}`;
}

function hebrewDay(dateStr) {
    const days = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
    const d = new Date(dateStr + 'T00:00:00');
    return `יום ${days[d.getDay()]}`;
}

function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}`;
}

// ===== Notifications =====
function showNotification(message, type = 'success') {
    // Remove any existing
    document.querySelectorAll('.notification').forEach(n => n.remove());

    const n = document.createElement('div');
    n.className = `notification notif-${type} show`;
    n.textContent = message;
    document.body.appendChild(n);

    setTimeout(() => {
        n.classList.remove('show');
        n.classList.add('hide');
        setTimeout(() => n.remove(), 350);
    }, 2800);
}

// ===== Loading =====
function showLoading(el) { if(el) el.classList.add('loading'); }
function hideLoading(el) { if(el) el.classList.remove('loading'); }

// ===== Auth State =====
auth.onAuthStateChanged(user => {
    if (user) {
        el('user-status').textContent = `שלום, ${user.displayName} 👋`;
        el('loginBtn').style.display = 'none';
        el('redirectLoginBtn').style.display = 'none';
        el('logoutBtn').style.display = 'inline-flex';
        el('settingsBtn').style.display = 'flex';
        el('main-content').style.display = 'block';

        userSettingsRef = db.ref(`users/${user.uid}/settings`);
        userSettingsRef.on('value', snap => {
            if (snap.exists()) {
                appSettings = snap.val();
                if (!window._initialLoadDone) {
                    currentView = appSettings.defaultView || 'daily';
                    window._initialLoadDone = true;
                }
                updateUI();
            }
        });

        userKidsRef = db.ref(`users/${user.uid}/kids`);
        userKidsRef.on('value', snapshot => {
            renderKids(snapshot.val());
        });

        setupToggleBtn();

    } else {
        el('user-status').textContent = 'אנא התחברי לצפייה בנתונים';
        el('loginBtn').style.display = 'inline-flex';
        el('logoutBtn').style.display = 'none';
        el('settingsBtn').style.display = 'none';
        el('main-content').style.display = 'none';
        el('redirectLoginBtn').style.display = 'none';
        window._initialLoadDone = false;
        userKidsRef = null;
    }
});

function updateUI() {
    el('app-title').textContent   = appSettings.title;
    el('page-title').textContent  = appSettings.title;
    el('addKidBtn').innerHTML     = `<i class="fas fa-plus"></i> הוספת ${appSettings.entityName}`;
    el('viewDaily').classList.toggle('active',  currentView === 'daily');
    el('viewWeekly').classList.toggle('active', currentView === 'weekly');
}

function setupToggleBtn() {
    const btn     = el('toggleTimelineBtn');
    const content = el('timeline-content-area');
    if (!btn || !content) return;
    btn.onclick = () => {
        isTimelineVisible = !isTimelineVisible;
        content.style.display = isTimelineVisible ? 'block' : 'none';
        btn.textContent = isTimelineVisible ? '➖' : '➕';
    };
}

// ===== Render Kids =====
function renderKids(kids) {
    const container    = el('kids-container');
    const timelineList = el('timeline-list');
    const timelineBox  = el('family-timeline');
    container.innerHTML    = '';
    timelineList.innerHTML = '';

    if (!kids) {
        timelineBox.style.display = 'none';

        // Empty state
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `<span class="empty-state-icon">👨‍👩‍👧‍👦</span><p>עדיין לא הוספת ילדים.<br>לחצי על הכפתור למטה כדי להתחיל!</p>`;
        container.appendChild(empty);
        return;
    }

    timelineBox.style.display = 'block';

    const selectedDate = el('dateFilter').value || todayStr();
    const baseDate     = new Date(selectedDate + 'T00:00:00');
    let allActivities  = [];

    // Assign stable colors by order
    const kidIds = Object.keys(kids);
    kidIds.forEach((kidId, idx) => {
        kidsColorMap[kidId] = getKidColor(idx);
        kidsIndexMap[kidId] = idx;
    });

    kidIds.forEach(kidId => {
        const kid        = kids[kidId];
        const activities = Array.isArray(kid.activities) ? kid.activities : Object.values(kid.activities || {});
        const color      = kidsColorMap[kidId];

        // --- Kid Card ---
        const box = document.createElement('div');
        box.className = 'kid-box';
        box.style.setProperty('--kid-color', color);
        box.style.borderTop = `5px solid ${color}`;

        // Avatar
        const avatar = document.createElement('div');
        avatar.className = 'kid-avatar';
        avatar.style.background = color;
        avatar.textContent = getInitials(kid.name);
        box.appendChild(avatar);

        // Name
        const nameEl = document.createElement('div');
        nameEl.className = 'kid-name';
        nameEl.textContent = kid.name;
        box.appendChild(nameEl);

        // Today's activities count
        const todayActs = activities.filter(a => {
            if (a.isPermanent) return false;
            return a.date === selectedDate || (a.repeatWeekly && new Date(a.date + 'T00:00:00').getDay() === baseDate.getDay());
        });

        const countEl = document.createElement('div');
        countEl.className = 'kid-activities-count';
        countEl.textContent = todayActs.length > 0 ? `${todayActs.length} פעילות היום` : 'אין פעילויות היום';
        box.appendChild(countEl);

        // Preview (first 2 activities)
        if (todayActs.length > 0) {
            const preview = document.createElement('div');
            preview.className = 'kid-activity-preview';
            preview.textContent = todayActs.slice(0, 2).map(a => `${formatTimeRange(a.time, a.endTime)} ${a.title}`).join('\n');
            preview.style.whiteSpace = 'pre-line';
            box.appendChild(preview);
        }

        // Permanent notes
        const permActs = activities.filter(a => a.isPermanent);
        permActs.forEach(a => {
            const pEl = document.createElement('div');
            pEl.className = 'permanent-note';
            pEl.textContent = `📌 ${a.title}`;
            box.appendChild(pEl);
        });

        // Delete kid button
        const del = document.createElement('span');
        del.className = 'delete-kid';
        del.innerHTML = '&times;';
        del.title = 'מחיקה';
        del.onclick = e => {
            e.stopPropagation();
            if (confirm(`למחוק את ${kid.name} וכל הפעילויות?`)) {
                userKidsRef.child(kidId).remove();
                showNotification(`${kid.name} נמחק/ה`, 'error');
            }
        };
        box.appendChild(del);

        box.onclick = () => openKidModal(kidId, kid);
        container.appendChild(box);

        // --- Collect timeline activities ---
        activities.forEach(a => {
            const type = a.isTransport ? 'transport' : (a.repeatWeekly ? 'recurring' : (a.isPermanent ? 'permanent' : 'regular'));
            if (!activeFilters.includes(type)) return;

            const matchDate = dStr => {
                const d = new Date(dStr + 'T00:00:00');
                if (a.isPermanent) return a.date === dStr;
                return a.date === dStr || (a.repeatWeekly && new Date(a.date + 'T00:00:00').getDay() === d.getDay());
            };

            if (currentView === 'daily') {
                if (matchDate(selectedDate)) {
                    allActivities.push({ ...a, kidName: kid.name, kidColor: color, displayDate: selectedDate });
                }
            } else {
                for (let i = 0; i < 7; i++) {
                    const t  = new Date(baseDate); t.setDate(baseDate.getDate() + i);
                    const ts = t.toISOString().slice(0, 10);
                    if (matchDate(ts)) {
                        allActivities.push({ ...a, kidName: kid.name, kidColor: color, displayDate: ts });
                    }
                }
            }
        });
    });

    renderTimeline(allActivities, timelineList);
}

// ===== Render Timeline =====
function renderTimeline(allActivities, timelineList) {
    timelineList.innerHTML = '';

    if (allActivities.length === 0) {
        timelineList.innerHTML = `<div class="empty-state"><span class="empty-state-icon">📭</span><p>אין פעילויות להצגה</p></div>`;
        el('whatsappShareBtn').disabled = true;
        el('whatsappShareBtn').style.opacity = '0.4';
        return;
    }

    allActivities.sort((a, b) =>
        a.displayDate.localeCompare(b.displayDate) ||
        (a.time || '99:99').localeCompare(b.time || '99:99')
    );

    let lastDate = '';
    allActivities.forEach(act => {
        if (currentView === 'weekly' && act.displayDate !== lastDate) {
            const header = document.createElement('div');
            header.className = 'timeline-day-header';
            header.textContent = `${hebrewDay(act.displayDate)} ${formatDate(act.displayDate)}`;
            timelineList.appendChild(header);
            lastDate = act.displayDate;
        }

        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.style.borderRightColor = act.kidColor;

        let icons = '';
        if (act.isTransport) {
            const style = act.isReturn ? 'display:inline-block;transform:scaleX(-1);filter:hue-rotate(150deg)' : 'display:inline-block';
            icons += `<span style="${style}" title="${act.isReturn ? 'הסעה חזור' : 'הסעה הלוך'}">🚗</span>`;
        }
        if (act.repeatWeekly) icons += ' 🔁';
        if (act.isPermanent)  icons += ' 📌';

        item.innerHTML = `
            <span class="timeline-time">${formatTimeRange(act.time, act.endTime)}</span>
            <span class="timeline-content">
                <span class="timeline-kid-name" style="background:${act.kidColor}">${act.kidName}</span>
                ${act.title} ${icons}
            </span>`;
        timelineList.appendChild(item);
    });

    el('whatsappShareBtn').disabled = false;
    el('whatsappShareBtn').style.opacity = '1';
}

// ===== Modal =====
function openKidModal(kidId, kid, activityToEdit = null) {
    const modalContent = el('modalContent');
    const color = kidsColorMap[kidId] || '#6366f1';

    // Title with color dot
    el('modalTitle').innerHTML = `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${color};margin-left:8px;vertical-align:middle;"></span>${activityToEdit ? 'עריכת פעילות' : kid.name}`;

    modalContent.innerHTML = '';
    el('modalBackdrop').style.display = 'flex';

    const activities = Array.isArray(kid.activities) ? kid.activities : Object.values(kid.activities || {});

    if (!activityToEdit) {
        // Share button
        const shareBtn = document.createElement('button');
        shareBtn.className = 'btn-share-personal';
        shareBtn.innerHTML = '<i class="fab fa-whatsapp"></i> שיתוף לוח אישי';
        shareBtn.onclick = () => shareEntireKid(kidId, kid.name);
        modalContent.appendChild(shareBtn);

        // Activity list
        const list = document.createElement('div');

        if (activities.length === 0) {
            list.innerHTML = '<div class="empty-state" style="padding:16px"><span class="empty-state-icon">📝</span><p>עדיין אין פעילויות</p></div>';
        } else {
            activities
                .slice()
                .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                .forEach(a => {
                    const item = document.createElement('div');
                    item.className = 'activity-item';

                    const dateFmt = a.date ? `${formatDate(a.date)} ` : '';
                    const icons   = `${a.isPermanent ? '📌' : ''}${a.isTransport ? '🚗' : ''}${a.repeatWeekly ? '🔁' : ''}`;

                    const actKid = JSON.stringify(kid).replace(/"/g, '&quot;');
                    const actA   = JSON.stringify(a).replace(/"/g, '&quot;');

                    item.innerHTML = `
                        <div class="activity-text">${dateFmt}${formatTimeRange(a.time, a.endTime)} <strong>${a.title}</strong> ${icons}</div>
                        <div class="activity-actions">
                            <button class="btn-link-share" onclick="event.stopPropagation();shareActivity('${kid.name}',${actA})" title="שיתוף">🔗</button>
                            <button class="btn-edit"   onclick="event.stopPropagation();openKidModal('${kidId}',${actKid},${actA})" title="עריכה">✏️</button>
                            <button class="btn-delete" onclick="event.stopPropagation();deleteActivity('${kidId}','${a.id}')" title="מחיקה">🗑️</button>
                        </div>`;
                    list.appendChild(item);
                });
        }
        modalContent.appendChild(list);
    }

    // Add / Edit form
    const form = document.createElement('div');
    form.className = 'add-activity-form';
    const dDate  = activityToEdit ? activityToEdit.date  : todayStr();
    const dTime  = activityToEdit ? (activityToEdit.time    || '') : '';
    const dEnd   = activityToEdit ? (activityToEdit.endTime || '') : '';
    const dTitle = activityToEdit ? activityToEdit.title : '';

    form.innerHTML = `
        <h4>${activityToEdit ? '✏️ עריכת פעילות' : '➕ פעילות חדשה'}</h4>
        <input type="date"  id="newActDate"  value="${dDate}" />
        <input type="text"  id="newActTitle" placeholder="מה עושים?" value="${dTitle}" />
        <div class="form-row">
            <span class="time-label">משעה:</span>
            <input type="time" id="newActTime"    style="flex:1" value="${dTime}">
            <span class="time-label">עד:</span>
            <input type="time" id="newActEndTime" style="flex:1" value="${dEnd}">
        </div>
        <div class="checkbox-grid" id="checkboxGrid">
            <label class="checkbox-option ${activityToEdit?.isPermanent  ? 'checked' : ''}" data-cb="newActPerm">
                <input type="checkbox" id="newActPerm"   ${activityToEdit?.isPermanent  ? 'checked' : ''}>📌 קבוע
            </label>
            <label class="checkbox-option ${activityToEdit?.repeatWeekly ? 'checked' : ''}" data-cb="newActRepeat">
                <input type="checkbox" id="newActRepeat" ${activityToEdit?.repeatWeekly ? 'checked' : ''}>🔁 חוזר שבועי
            </label>
            <label class="checkbox-option ${activityToEdit?.isTransport  ? 'checked' : ''}" data-cb="newActTrans" id="transCbLabel">
                <input type="checkbox" id="newActTrans"  ${activityToEdit?.isTransport  ? 'checked' : ''}>🚗 הסעה
            </label>
        </div>
        <div id="returnOption" class="return-option" style="display:${activityToEdit?.isTransport ? 'block' : 'none'}">
            <label class="checkbox-option ${activityToEdit?.isReturn ? 'checked' : ''}" data-cb="newActIsReturn">
                <input type="checkbox" id="newActIsReturn" ${activityToEdit?.isReturn ? 'checked' : ''}>🏠 הסעה חזור (הביתה)
            </label>
        </div>
        <button class="save-act-btn" id="saveActBtn">💾 שמור פעילות</button>
    `;
    modalContent.appendChild(form);

    // Checkbox visual toggle
    form.querySelectorAll('.checkbox-option').forEach(label => {
        label.addEventListener('click', () => {
            const cbId = label.dataset.cb;
            const cb   = el(cbId);
            if (!cb) return;
            cb.checked = !cb.checked;
            label.classList.toggle('checked', cb.checked);

            // Show/hide return option when transport toggled
            if (cbId === 'newActTrans') {
                el('returnOption').style.display = cb.checked ? 'block' : 'none';
                if (!cb.checked) {
                    el('newActIsReturn').checked = false;
                    el('returnOption').querySelector('.checkbox-option').classList.remove('checked');
                }
            }
        });
    });

    el('saveActBtn').onclick = () => saveActivity(kidId, kid, activityToEdit, activities);
}

function saveActivity(kidId, kid, activityToEdit, activities) {
    const title = el('newActTitle').value.trim();
    const date  = el('newActDate').value;
    if (!title || !date) { showNotification('חובה למלא תאריך וכותרת', 'error'); return; }

    const newAct = {
        id:          activityToEdit ? activityToEdit.id : 'a_' + Date.now(),
        title,
        date,
        time:        el('newActTime').value    || '',
        endTime:     el('newActEndTime').value || '',
        isPermanent: el('newActPerm').checked,
        repeatWeekly:el('newActRepeat').checked,
        isTransport: el('newActTrans').checked,
        isReturn:    el('newActIsReturn') ? el('newActIsReturn').checked : false,
    };

    const newList = activityToEdit
        ? activities.map(a => a.id === activityToEdit.id ? newAct : a)
        : [...activities, newAct];

    userKidsRef.child(kidId).child('activities').set(newList)
        .then(() => {
            showNotification(activityToEdit ? 'הפעילות עודכנה ✓' : 'הפעילות נוספה ✓', 'success');
            userKidsRef.child(kidId).once('value', s => openKidModal(kidId, s.val()));
        })
        .catch(err => {
            console.error(err);
            showNotification('שגיאה בשמירה', 'error');
        });
}

// ===== Delete Activity =====
window.deleteActivity = (kidId, actId) => {
    if (!confirm('למחוק את הפעילות?')) return;
    userKidsRef.child(kidId).child('activities').once('value', snap => {
        const list     = snap.val() || [];
        const filtered = list.filter(a => String(a.id) !== String(actId));
        userKidsRef.child(kidId).child('activities').set(filtered)
            .then(() => {
                showNotification('הפעילות נמחקה', 'error');
                userKidsRef.child(kidId).once('value', s => {
                    if (s.exists()) openKidModal(kidId, s.val());
                    else el('modalBackdrop').style.display = 'none';
                });
            })
            .catch(err => console.error('מחיקה נכשלה:', err));
    });
};

// ===== Share =====
window.shareActivity = (kidName, a) => {
    const data = btoa(unescape(encodeURIComponent(JSON.stringify(a))));
    const url  = `${location.origin}${location.pathname}?sharedAct=${data}`;
    const txt  = `פעילות עבור ${kidName}: ${a.title}. להוספה: ${url}`;
    if (navigator.share) navigator.share({ title: 'שיתוף פעילות', text: txt, url });
    else { navigator.clipboard.writeText(txt); showNotification('הועתק ללוח!', 'info'); }
};

function shareEntireKid(kidId, kidName) {
    userKidsRef.child(kidId).once('value', snap => {
        const data = btoa(unescape(encodeURIComponent(JSON.stringify(snap.val()))));
        const url  = `${location.origin}${location.pathname}?sharedKid=${data}`;
        if (navigator.share) navigator.share({ title: kidName, url });
        else { navigator.clipboard.writeText(url); showNotification('קישור הועתק!', 'info'); }
    });
}

// ===== WhatsApp Share =====
function buildWhatsappMessage() {
    const items = document.querySelectorAll('.timeline-item');
    if (!items.length) return null;

    const dateVal  = el('dateFilter').value || todayStr();
    const dateDisp = currentView === 'daily'
        ? `${hebrewDay(dateVal)} ${formatDate(dateVal)}`
        : `שבוע מ-${formatDate(dateVal)}`;

    let msg = `*📅 לו"ז ${appSettings.title} — ${dateDisp}*\n\n`;

    document.querySelectorAll('.timeline-day-header, .timeline-item').forEach(node => {
        if (node.classList.contains('timeline-day-header')) {
            msg += `\n*${node.textContent.trim()}*\n`;
        } else {
            const time    = node.querySelector('.timeline-time')?.textContent?.trim() || '';
            const content = node.querySelector('.timeline-content')?.textContent?.trim().replace(/\s+/g, ' ') || '';
            msg += `⏰ ${time}  ${content}\n`;
        }
    });

    return msg;
}

// ===== Date filter auto-refresh =====
let _dateChangeTimer = null;

// ===== Event Listeners — DOM Ready =====
document.addEventListener('DOMContentLoaded', () => {
    // Initialize date
    const df = el('dateFilter');
    if (df) df.value = todayStr();

    // Filter dropdown
    const filterBtn  = el('filterDropdownBtn');
    const filterMenu = el('filterMenu');

    if (filterBtn) {
        filterBtn.onclick = e => {
            e.stopPropagation();
            filterMenu.style.display = filterMenu.style.display === 'none' ? 'block' : 'none';
        };
    }
    document.onclick = () => { if (filterMenu) filterMenu.style.display = 'none'; };
    if (filterMenu) filterMenu.onclick = e => e.stopPropagation();

    document.querySelectorAll('.filter-check').forEach(cb => {
        cb.onchange = () => {
            activeFilters = Array.from(document.querySelectorAll('.filter-check:checked')).map(c => c.value);
            if (userKidsRef) userKidsRef.once('value', s => renderKids(s.val()));
        };
    });

    // Date change — debounced
    if (df) {
        df.onchange = () => {
            clearTimeout(_dateChangeTimer);
            _dateChangeTimer = setTimeout(() => {
                if (userKidsRef) userKidsRef.once('value', s => renderKids(s.val()));
            }, 200);
        };
    }
});

// ===== Event Listeners — Window Load =====
window.addEventListener('load', () => {
    // Login
    const loginBtn = el('loginBtn');
    if (loginBtn) {
        loginBtn.onclick = async e => {
            e.preventDefault();
            if (loginBtn.disabled) return;
            loginBtn.disabled = true;
            showLoading(loginBtn);
            try {
                await auth.signInWithPopup(googleProvider);
            } catch (err) {
                hideLoading(loginBtn);
                loginBtn.disabled = false;
                if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
                if (err.code === 'auth/popup-blocked') {
                    el('redirectLoginBtn').style.display = 'inline-flex';
                    showNotification('הדפדפן חסם את הפופאפ — נסי "התחברות בדף חדש"', 'error');
                } else {
                    showNotification('שגיאה בהתחברות', 'error');
                    el('redirectLoginBtn').style.display = 'inline-flex';
                }
            }
        };
    }

    // Redirect login
    const redirectLoginBtn = el('redirectLoginBtn');
    if (redirectLoginBtn) {
        redirectLoginBtn.onclick = () => auth.signInWithRedirect(googleProvider);
    }

    // Logout
    const logoutBtn = el('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            logoutBtn.disabled = true;
            auth.signOut()
                .then(() => { showNotification('התנתקת בהצלחה', 'info'); logoutBtn.disabled = false; })
                .catch(() => { showNotification('שגיאה בהתנתקות', 'error'); logoutBtn.disabled = false; });
        };
    }

    // Add kid / entity
    const addKidBtn = el('addKidBtn');
    if (addKidBtn) {
        addKidBtn.onclick = () => {
            const name = prompt(`שם ה${appSettings.entityName}:`);
            if (name && name.trim() && userKidsRef) {
                const ref = userKidsRef.push();
                ref.set({ id: ref.key, name: name.trim(), activities: [] })
                   .then(() => showNotification(`${name} נוסף/ה! 🎉`, 'success'));
            }
        };
    }

    // View toggles
    el('viewDaily').onclick = () => {
        currentView = 'daily';
        updateUI();
        if (userKidsRef) userKidsRef.once('value', s => renderKids(s.val()));
    };
    el('viewWeekly').onclick = () => {
        currentView = 'weekly';
        updateUI();
        if (userKidsRef) userKidsRef.once('value', s => renderKids(s.val()));
    };

    // Refresh
    el('refreshBtn').onclick = () => {
        if (userKidsRef) userKidsRef.once('value', s => renderKids(s.val()));
        showNotification('מתרענן...', 'info');
    };

    // Close modal
    el('closeModal').onclick = () => {
        el('modalBackdrop').style.display = 'none';
    };
    el('modalBackdrop').addEventListener('click', e => {
        if (e.target === el('modalBackdrop')) el('modalBackdrop').style.display = 'none';
    });

    // WhatsApp share
    const waBtn = el('whatsappShareBtn');
    if (waBtn) {
        waBtn.onclick = () => {
            const msg = buildWhatsappMessage();
            if (!msg) { showNotification('אין פעילויות לשיתוף', 'error'); return; }
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
            showNotification('נפתח בוואטסאפ! 📱', 'success');
        };
    }

    // Settings open
    const settingsBtn = el('settingsBtn');
    if (settingsBtn) {
        settingsBtn.onclick = () => {
            el('settingsTitle').value       = appSettings.title       || 'הלוח שלי';
            el('settingsEntityName').value  = appSettings.entityName  || 'פעילויות';
            el('settingsDefaultView').value = appSettings.defaultView || 'daily';
            el('settingsModalBackdrop').style.display = 'flex';
        };
    }

    // Settings save
    const saveSettingsBtn = el('saveSettingsBtn');
    if (saveSettingsBtn) {
        saveSettingsBtn.onclick = () => {
            const newSettings = {
                title:       el('settingsTitle').value       || 'הלוח שלי',
                entityName:  el('settingsEntityName').value  || 'פעילויות',
                defaultView: el('settingsDefaultView').value || 'daily',
            };
            if (userSettingsRef) {
                showLoading(saveSettingsBtn);
                userSettingsRef.set(newSettings)
                    .then(() => {
                        appSettings = newSettings;
                        updateUI();
                        el('settingsModalBackdrop').style.display = 'none';
                        hideLoading(saveSettingsBtn);
                        showNotification('הגדרות נשמרו ✓', 'success');
                    })
                    .catch(() => {
                        hideLoading(saveSettingsBtn);
                        showNotification('שגיאה בשמירת הגדרות', 'error');
                    });
            }
        };
    }
});

// ===== Redirect result =====
auth.getRedirectResult()
    .then(result => {
        if (result.user) showNotification(`ברוכה הבאה, ${result.user.displayName}! 🎉`, 'success');
    })
    .catch(err => console.error('Redirect error:', err));

// ===== Global error handler =====
window.addEventListener('error', e => {
    console.error('JS Error:', e.error);
});
