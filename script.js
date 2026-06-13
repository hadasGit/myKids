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
        initParentSharing(user);
        handleIncomingShare();

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
                    allActivities.push({ ...a, kidId, kidName: kid.name, kidColor: color, displayDate: selectedDate });
                }
            } else {
                for (let i = 0; i < 7; i++) {
                    const t  = new Date(baseDate); t.setDate(baseDate.getDate() + i);
                    const ts = t.toISOString().slice(0, 10);
                    if (matchDate(ts)) {
                        allActivities.push({ ...a, kidId, kidName: kid.name, kidColor: color, displayDate: ts });
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

        const isDone = act.isDone === true;
        if (isDone) item.classList.add('timeline-item-done');

        item.innerHTML = `
            <span class="timeline-time">${formatTimeRange(act.time, act.endTime)}</span>
            <span class="timeline-content">
                <span class="timeline-kid-name" style="background:${act.kidColor}">${act.kidName}</span>
                ${act.title} ${icons}
            </span>
            <span class="swipe-hint-done" title="החלק ימינה לסיום">✅</span>`;
        timelineList.appendChild(item);

        // Swipe: right = toggle done, left = open edit modal
        if (act.kidId && act.id) {
            addSwipeListeners(item,
                () => { // swipe right → toggle done
                    markActivityDone(act.kidId, act.id, !isDone);
                },
                () => { // swipe left → open edit
                    if (userKidsRef && act.kidId) {
                        userKidsRef.child(act.kidId).once('value', snap => {
                            if (snap.exists()) openKidModal(act.kidId, snap.val(), act);
                        });
                    }
                }
            );
        }
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
        ${!activityToEdit ? `
        <div class="smart-input-wrap">
            <textarea id="smartTextInput" class="smart-text-input" placeholder="✍️ כתוב בחופשיות... למשל: נועה ריפוי בעיסוק שני 16:00 חוזר" rows="2"></textarea>
            <button type="button" id="smartParseBtn" class="btn-smart-parse">⚡ מלא אוטומטי</button>
        </div>
        <div class="smart-divider"><span>או מלא ידנית</span></div>
        ` : ''}
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

    // Smart parse button
    const smartBtn = el('smartParseBtn');
    if (smartBtn) {
        smartBtn.onclick = () => {
            const text = el('smartTextInput').value.trim();
            if (!text) return;

            // Build kidsList from current snapshot
            const kidsList = [];
            if (userKidsRef) {
                userKidsRef.once('value', snap => {
                    const allKids = snap.val() || {};
                    Object.entries(allKids).forEach(([id, k]) => kidsList.push({ id, name: k.name }));
                    applyParsed(parseActivityText(text, kidsList));
                });
            } else {
                applyParsed(parseActivityText(text, []));
            }
        };
    }

    function applyParsed(parsed) {
        if (parsed.title)  el('newActTitle').value = parsed.title;
        if (parsed.date)   el('newActDate').value  = parsed.date;
        if (parsed.time)   el('newActTime').value  = parsed.time;
        if (parsed.endTime) el('newActEndTime').value = parsed.endTime;

        // Checkboxes
        const setCheck = (id, val) => {
            const cb = el(id);
            const label = cb?.closest('.checkbox-option');
            if (!cb) return;
            cb.checked = val;
            label?.classList.toggle('checked', val);
        };
        setCheck('newActRepeat', parsed.repeatWeekly);
        setCheck('newActPerm',   parsed.isPermanent);
        setCheck('newActTrans',  parsed.isTransport);
        if (el('newActIsReturn')) setCheck('newActIsReturn', parsed.isReturn);
        if (el('returnOption'))   el('returnOption').style.display = parsed.isTransport ? 'block' : 'none';

        showNotification('שדות מולאו אוטומטית ✓', 'success');
    }

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

// ===== SMART TEXT PARSER =====
// Parses free Hebrew text into activity fields.
// Returns: { kidId, title, date, time, endTime, repeatWeekly, isTransport, isReturn, isPermanent }
// kidsList = array of { id, name } from Firebase snapshot

const HEBREW_DAYS = {
    'ראשון':  0, 'יום ראשון':  0,
    'שני':    1, 'יום שני':    1,
    'שלישי':  2, 'יום שלישי':  2,
    'רביעי':  3, 'יום רביעי':  3,
    'חמישי':  4, 'יום חמישי':  4,
    'שישי':   5, 'יום שישי':   5,
    'שבת':    6, 'יום שבת':    6,
};

const HEBREW_HOUR_WORDS = {
    'אחת':    1, 'שתיים':  2, 'שתים':   2,
    'שלוש':   3, 'ארבע':   4, 'חמש':    5,
    'שש':     6, 'שבע':    7, 'שמונה':  8,
    'תשע':    9, 'עשר':   10, 'אחת עשרה': 11,
    'שתים עשרה': 12, 'שנים עשרה': 12,
};

function parseActivityText(text, kidsList = []) {
    const result = {
        kidId:        null,
        title:        '',
        date:         todayStr(),
        time:         '',
        endTime:      '',
        repeatWeekly: false,
        isTransport:  false,
        isReturn:     false,
        isPermanent:  false,
    };

    let remaining = text.trim();

    // --- 1. Find kid name ---
    if (kidsList.length > 0) {
        // Sort longest name first to avoid partial matches
        const sorted = [...kidsList].sort((a, b) => b.name.length - a.name.length);
        for (const kid of sorted) {
            if (remaining.includes(kid.name)) {
                result.kidId = kid.id;
                remaining = remaining.replace(kid.name, '').trim();
                break;
            }
        }
    }

    // --- 2. Flags ---
    if (/חוזר|כל שבוע|שבועי|🔁/.test(remaining)) {
        result.repeatWeekly = true;
        remaining = remaining.replace(/חוזר|כל שבוע|שבועי|🔁/g, '').trim();
    }
    if (/קבוע|תמידי|📌/.test(remaining)) {
        result.isPermanent = true;
        remaining = remaining.replace(/קבוע|תמידי|📌/g, '').trim();
    }
    if (/חזרה|חזור|הביתה/.test(remaining)) {
        result.isTransport = true;
        result.isReturn = true;
        remaining = remaining.replace(/חזרה|חזור|הביתה/g, '').trim();
    } else if (/הסעה|מסיעה|🚗/.test(remaining)) {
        result.isTransport = true;
        remaining = remaining.replace(/הסעה|מסיעה|🚗/g, '').trim();
    }

    // --- 3. Day / date ---
    // Explicit date: "29.6" / "29/6" / "29.6.2026"
    const explicitDateMatch = remaining.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
    if (explicitDateMatch) {
        const day   = explicitDateMatch[1].padStart(2, '0');
        const month = explicitDateMatch[2].padStart(2, '0');
        const year  = explicitDateMatch[3]
            ? (explicitDateMatch[3].length === 2 ? '20' + explicitDateMatch[3] : explicitDateMatch[3])
            : new Date().getFullYear();
        result.date = `${year}-${month}-${day}`;
        remaining = remaining.replace(explicitDateMatch[0], '').trim();
    } else {
        // Hebrew day names
        for (const [word, dayIndex] of Object.entries(HEBREW_DAYS)) {
            if (remaining.includes(word)) {
                result.date = nextWeekdayDate(dayIndex);
                remaining = remaining.replace(word, '').trim();
                break;
            }
        }
        // "היום" / "מחר"
        if (/היום/.test(remaining)) {
            result.date = todayStr();
            remaining = remaining.replace(/היום/g, '').trim();
        } else if (/מחר/.test(remaining)) {
            const d = new Date(); d.setDate(d.getDate() + 1);
            result.date = d.toISOString().slice(0, 10);
            remaining = remaining.replace(/מחר/g, '').trim();
        }
    }

    // --- 4. Time ---
    // Detect period modifier FIRST ("בערב", "בצהריים", "בבוקר", "בלילה")
    let pmOffset = 0;
    if (/בערב|בלילה/.test(remaining)) {
        pmOffset = 12; // add 12 to hours 1-11
        remaining = remaining.replace(/בערב|בלילה/g, '').trim();
    } else if (/בצהריים|בצהרים/.test(remaining)) {
        pmOffset = 12;
        remaining = remaining.replace(/בצהריים|בצהרים/g, '').trim();
    } else if (/בבוקר/.test(remaining)) {
        pmOffset = 0;
        remaining = remaining.replace(/בבוקר/g, '').trim();
    }

    function applyPmOffset(h) {
        // Only add offset to 1-11 (noon/midnight cases handled separately)
        if (pmOffset > 0 && h >= 1 && h <= 11) return h + pmOffset;
        return h;
    }

    // "16:30 עד 17:00" or "16:00"
    const timeRangeMatch = remaining.match(/(\d{1,2}:\d{2})\s*(?:עד|-)\s*(\d{1,2}:\d{2})/);
    if (timeRangeMatch) {
        result.time    = padTime(timeRangeMatch[1]);
        result.endTime = padTime(timeRangeMatch[2]);
        remaining = remaining.replace(timeRangeMatch[0], '').trim();
    } else {
        const timeMatch = remaining.match(/(\d{1,2}:\d{2})/);
        if (timeMatch) {
            result.time = padTime(timeMatch[1]);
            remaining = remaining.replace(timeMatch[0], '').trim();
        } else {
            // "16 וחצי" / "ארבע וחצי" / "ארבע ורבע"
            const halfMatch = remaining.match(/(\d{1,2})\s*(וחצי|וחצ'|וחצ)/);
            if (halfMatch) {
                const h = applyPmOffset(parseInt(halfMatch[1]));
                result.time = padTime(`${h}:30`);
                remaining = remaining.replace(halfMatch[0], '').trim();
            } else {
                const quarterMatch = remaining.match(/(\d{1,2})\s*ורבע/);
                if (quarterMatch) {
                    const h = applyPmOffset(parseInt(quarterMatch[1]));
                    result.time = padTime(`${h}:15`);
                    remaining = remaining.replace(quarterMatch[0], '').trim();
                } else {
                    // Standalone digit hour: "בשבע" / "שבע" / "ב5"
                    const digitHourMatch = remaining.match(/ב?(\d{1,2})(?!\d|[./])/);
                    if (digitHourMatch) {
                        const h = applyPmOffset(parseInt(digitHourMatch[1]));
                        result.time = padTime(`${h}:00`);
                        remaining = remaining.replace(digitHourMatch[0], '').trim();
                    } else {
                        // Word-based hours ("שבע", "חמש", ...)
                        for (const [word, rawH] of Object.entries(HEBREW_HOUR_WORDS)) {
                            if (remaining.includes(word)) {
                                const h = applyPmOffset(rawH);
                                const halfW = word + ' וחצי';
                                if (remaining.includes(halfW)) {
                                    result.time = `${String(h).padStart(2,'0')}:30`;
                                    remaining = remaining.replace(halfW, '').trim();
                                } else {
                                    result.time = `${String(h).padStart(2,'0')}:00`;
                                    remaining = remaining.replace(word, '').trim();
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    // --- 5. Remaining = title (clean up punctuation/extra spaces) ---
    result.title = remaining
        .replace(/[—–\-,،.]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

    return result;
}

// Helper: next occurrence of weekday (0=Sun … 6=Sat), from today
function nextWeekdayDate(targetDay) {
    const today = new Date();
    const todayDay = today.getDay();
    let diff = targetDay - todayDay;
    if (diff < 0) diff += 7;
    if (diff === 0) diff = 7; // "שני" when today IS Monday → next Monday
    const d = new Date(today);
    d.setDate(today.getDate() + diff);
    return d.toISOString().slice(0, 10);
}

// Helper: "9:5" → "09:05"
function padTime(t) {
    const [h, m] = t.split(':');
    return `${h.padStart(2,'0')}:${m.padStart(2,'0')}`;
}

// Expose for use by voice module and modal
window.parseActivityText = parseActivityText;

// ===== SWIPE TO COMPLETE =====
function addSwipeListeners(element, onSwipeRight, onSwipeLeft) {
    let startX = null;
    let startY = null;
    const THRESHOLD = 50; // px
    const ANGLE_LIMIT = 35; // degrees — avoid triggering on vertical scroll

    element.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });

    element.addEventListener('touchend', e => {
        if (startX === null) return;
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        startX = null;
        startY = null;

        if (Math.abs(dy) > Math.abs(dx) * Math.tan((ANGLE_LIMIT * Math.PI) / 180)) return; // too vertical
        if (Math.abs(dx) < THRESHOLD) return;

        if (dx > 0) onSwipeRight();
        else        onSwipeLeft();
    }, { passive: true });
}

function markActivityDone(kidId, actId, isDone) {
    userKidsRef.child(kidId).child('activities').once('value', snap => {
        const list = snap.val() || [];
        const arr  = Array.isArray(list) ? list : Object.values(list);
        const updated = arr.map(a => String(a.id) === String(actId) ? { ...a, isDone } : a);
        userKidsRef.child(kidId).child('activities').set(updated)
            .then(() => showNotification(isDone ? '✅ סומן כבוצע' : 'סימון הוסר', 'success'))
            .catch(() => showNotification('שגיאה', 'error'));
    });
}

// ===== VOICE INPUT =====
(function initVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    window.addEventListener('load', () => {
        const voiceBtn = el('voiceBtn');
        if (!voiceBtn) return;

        if (!SpeechRecognition) {
            // Browser doesn't support — hide button silently
            voiceBtn.style.display = 'none';
            return;
        }

        const recog = new SpeechRecognition();
        recog.lang = 'he-IL';
        recog.interimResults = false;
        recog.maxAlternatives = 1;

        let isListening = false;

        voiceBtn.onclick = () => {
            if (isListening) { recog.stop(); return; }
            recog.start();
        };

        recog.onstart = () => {
            isListening = true;
            voiceBtn.classList.add('listening');
            showNotification('🎙️ מקשיב... דבר עכשיו', 'info');
        };

        recog.onend = () => {
            isListening = false;
            voiceBtn.classList.remove('listening');
        };

        recog.onerror = (e) => {
            isListening = false;
            voiceBtn.classList.remove('listening');
            if (e.error === 'no-speech') {
                showNotification('לא נשמע כלום. נסי שוב 🎤', 'error');
            } else if (e.error === 'not-allowed') {
                showNotification('נא לאפשר גישה למיקרופון', 'error');
            } else {
                showNotification('שגיאה בזיהוי קול', 'error');
            }
        };

        recog.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            showVoiceConfirmation(transcript);
        };
    });

    function showVoiceConfirmation(transcript) {
        // Build kidsList then parse
        const kidsList = [];
        if (userKidsRef) {
            userKidsRef.once('value', snap => {
                const allKids = snap.val() || {};
                Object.entries(allKids).forEach(([id, k]) => kidsList.push({ id, name: k.name }));
                const parsed = parseActivityText(transcript, kidsList);
                renderVoiceConfirmModal(transcript, parsed, kidsList);
            });
        } else {
            renderVoiceConfirmModal(transcript, parseActivityText(transcript, []), []);
        }
    }

    function renderVoiceConfirmModal(transcript, parsed, kidsList) {
        const modalContent = el('modalContent');
        el('modalTitle').innerHTML = '🎙️ זיהוי קולי';
        modalContent.innerHTML = '';
        el('modalBackdrop').style.display = 'flex';

        // Show what was heard
        const heard = document.createElement('div');
        heard.className = 'voice-heard';
        heard.innerHTML = `<span class="voice-heard-label">נשמע:</span> <em>"${transcript}"</em>`;
        modalContent.appendChild(heard);

        // Summary of parsed fields
        const kidName = kidsList.find(k => k.id === parsed.kidId)?.name || '—';
        const summary = document.createElement('div');
        summary.className = 'voice-summary';
        summary.innerHTML = `
            <div class="voice-field"><span>👤 ילד/ה</span><strong>${kidName}</strong></div>
            <div class="voice-field"><span>📝 פעילות</span><strong>${parsed.title || '—'}</strong></div>
            <div class="voice-field"><span>📅 תאריך</span><strong>${parsed.date}</strong></div>
            <div class="voice-field"><span>⏰ שעה</span><strong>${parsed.time || '—'}</strong></div>
            ${parsed.repeatWeekly ? '<div class="voice-field"><span>🔁</span><strong>חוזר שבועי</strong></div>' : ''}
            ${parsed.isTransport  ? '<div class="voice-field"><span>🚗</span><strong>הסעה</strong></div>' : ''}
        `;
        modalContent.appendChild(summary);

        // If no kid found and there are kids, show selector
        if (!parsed.kidId && kidsList.length > 0) {
            const kidSel = document.createElement('div');
            kidSel.className = 'voice-kid-select';
            kidSel.innerHTML = `<label style="font-size:0.88rem;font-weight:600;color:var(--text-secondary)">בחרי ילד/ה:</label>`;
            const sel = document.createElement('select');
            sel.className = 'date-input';
            sel.innerHTML = `<option value="">— בחרי —</option>` +
                kidsList.map(k => `<option value="${k.id}">${k.name}</option>`).join('');
            sel.onchange = () => { parsed.kidId = sel.value; };
            kidSel.appendChild(sel);
            modalContent.appendChild(kidSel);
        }

        // Action buttons
        const actions = document.createElement('div');
        actions.className = 'voice-actions';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'save-act-btn';
        saveBtn.textContent = '✅ שמור';
        saveBtn.onclick = () => {
            if (!parsed.kidId) { showNotification('בחרי ילד/ה קודם', 'error'); return; }
            if (!parsed.title) { showNotification('לא זוהתה פעילות', 'error'); return; }
            const newAct = {
                id:           'a_' + Date.now(),
                title:        parsed.title,
                date:         parsed.date,
                time:         parsed.time,
                endTime:      parsed.endTime,
                isPermanent:  parsed.isPermanent,
                repeatWeekly: parsed.repeatWeekly,
                isTransport:  parsed.isTransport,
                isReturn:     parsed.isReturn,
            };
            userKidsRef.child(parsed.kidId).child('activities').once('value', snap => {
                const list = snap.val() || [];
                const arr  = Array.isArray(list) ? list : Object.values(list);
                userKidsRef.child(parsed.kidId).child('activities').set([...arr, newAct])
                    .then(() => {
                        el('modalBackdrop').style.display = 'none';
                        showNotification('הפעילות נוספה ✓', 'success');
                    })
                    .catch(() => showNotification('שגיאה בשמירה', 'error'));
            });
        };

        const editBtn = document.createElement('button');
        editBtn.className = 'btn-outline';
        editBtn.style.cssText = 'margin-top:8px;';
        editBtn.textContent = '✏️ ערוך ידנית';
        editBtn.onclick = () => {
            if (!parsed.kidId) { showNotification('בחרי ילד/ה קודם', 'error'); return; }
            userKidsRef.child(parsed.kidId).once('value', snap => {
                const kid = snap.val();
                openKidModal(parsed.kidId, kid, {
                    ...parsed,
                    id: 'a_' + Date.now(),
                    _prefill: true,
                });
            });
        };

        actions.appendChild(saveBtn);
        actions.appendChild(editBtn);
        modalContent.appendChild(actions);
    }
})();

// ===== PARENT SHARING =====
let _currentUserUid   = null;
let _currentUserName  = null;
let _currentUserEmail = null;

function sanitizeEmail(email) {
    return email.toLowerCase().replace(/[.#$[\]]/g, '_');
}

function initParentSharing(user) {
    _currentUserUid   = user.uid;
    _currentUserName  = user.displayName;
    _currentUserEmail = user.email;

    const myEmailKey = sanitizeEmail(user.email);
    db.ref('invites/' + myEmailKey).once('value', snap => {
        if (snap.exists()) showInviteModal(snap.val(), myEmailKey);
    });

    db.ref('users/' + user.uid + '/settings/linkedTo').once('value', snap => {
        if (snap.val()) switchToLinkedParent(snap.val());
        updateLinkedStatus(snap.val());
    });

    const shareBtn = document.getElementById('shareParentBtn');
    if (shareBtn) shareBtn.onclick = sendParentInvite;
    const unlinkBtn = document.getElementById('unlinkParentBtn');
    if (unlinkBtn) unlinkBtn.onclick = unlinkParent;
}

function sendParentInvite() {
    const emailInput = document.getElementById('shareParentEmail');
    const msg        = document.getElementById('shareParentMsg');
    const email      = emailInput && emailInput.value.trim();
    if (!email || !email.includes('@')) { if (msg) msg.textContent = 'אימייל לא תקין'; return; }
    const key = sanitizeEmail(email);
    db.ref('invites/' + key).set({ fromUid: _currentUserUid, fromName: _currentUserName, fromEmail: _currentUserEmail, sentAt: Date.now() })
        .then(() => { if (msg) msg.textContent = 'הזמנה נשלחה ✓'; if (emailInput) emailInput.value = ''; })
        .catch(() => { if (msg) msg.textContent = 'שגיאה בשליחה'; });
}

function showInviteModal(inv, myEmailKey) {
    const modalContent = document.getElementById('modalContent');
    document.getElementById('modalTitle').innerHTML = '👨‍👩‍👧 הזמנה לשיתוף לוח';
    modalContent.innerHTML = '';
    document.getElementById('modalBackdrop').style.display = 'flex';

    const card = document.createElement('div');
    card.className = 'voice-summary';
    card.innerHTML = '<div class="voice-field"><span>👤 מי</span><strong>' + inv.fromName + '</strong></div>' +
        '<div class="voice-field"><span>📧 אימייל</span><strong>' + inv.fromEmail + '</strong></div>' +
        '<p style="font-size:0.88rem;color:var(--text-secondary);margin-top:10px;">אם תאשרי, תראי את הלוח של ' + inv.fromName + ' בזמן אמת.</p>';
    modalContent.appendChild(card);

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'save-act-btn';
    acceptBtn.style.marginTop = '12px';
    acceptBtn.textContent = '✅ אני מאשרת';
    acceptBtn.onclick = () => {
        db.ref('users/' + _currentUserUid + '/settings/linkedTo').set(inv.fromUid)
            .then(() => {
                db.ref('invites/' + myEmailKey).remove();
                document.getElementById('modalBackdrop').style.display = 'none';
                showNotification('מחוברת ללוח של ' + inv.fromName + ' ✓', 'success');
                switchToLinkedParent(inv.fromUid);
            })
            .catch(() => showNotification('שגיאה בחיבור', 'error'));
    };

    const declineBtn = document.createElement('button');
    declineBtn.className = 'btn-outline';
    declineBtn.style.marginTop = '8px';
    declineBtn.textContent = '❌ דחי';
    declineBtn.onclick = () => { db.ref('invites/' + myEmailKey).remove(); document.getElementById('modalBackdrop').style.display = 'none'; };

    modalContent.appendChild(acceptBtn);
    modalContent.appendChild(declineBtn);
}

function switchToLinkedParent(linkedUid) {
    if (userKidsRef) userKidsRef.off();
    userKidsRef = db.ref('users/' + linkedUid + '/kids');
    userKidsRef.on('value', snap => renderKids(snap.val()));
    updateLinkedStatus(linkedUid);
}

function updateLinkedStatus(linkedUid) {
    const statusEl  = document.getElementById('linkedParentStatus');
    const unlinkWrap = document.getElementById('unlinkParentWrap');
    if (!statusEl) return;
    if (linkedUid) {
        statusEl.innerHTML = '<span style="color:var(--success)">✅ מחוברת ללוח משותף</span>';
        if (unlinkWrap) unlinkWrap.style.display = 'block';
    } else {
        statusEl.textContent = 'לא מחוברת להורה נוסף';
        if (unlinkWrap) unlinkWrap.style.display = 'none';
    }
}

function unlinkParent() {
    if (!confirm('לנתק את השיתוף עם ההורה השני?')) return;
    db.ref('users/' + _currentUserUid + '/settings/linkedTo').remove()
        .then(() => {
            if (userKidsRef) userKidsRef.off();
            userKidsRef = db.ref('users/' + _currentUserUid + '/kids');
            userKidsRef.on('value', snap => renderKids(snap.val()));
            updateLinkedStatus(null);
            showNotification('השיתוף נותק', 'info');
            document.getElementById('settingsModalBackdrop').style.display = 'none';
        })
        .catch(() => showNotification('שגיאה בניתוק', 'error'));
}

// ===== INCOMING SHARE HANDLER =====
function handleIncomingShare() {
    const params = new URLSearchParams(location.search);
    const rawAct = params.get('sharedAct');
    const rawKid = params.get('sharedKid');
    if (!rawAct && !rawKid) return;
    history.replaceState({}, '', location.pathname);
    try {
        if (rawAct) {
            const act = JSON.parse(decodeURIComponent(escape(atob(rawAct))));
            showShareImportModal({ type: 'activity', data: act });
        } else {
            const kid = JSON.parse(decodeURIComponent(escape(atob(rawKid))));
            showShareImportModal({ type: 'kid', data: kid });
        }
    } catch(e) { showNotification('קישור השיתוף לא תקין', 'error'); }
}

function showShareImportModal({ type, data }) {
    const modalContent = document.getElementById('modalContent');
    document.getElementById('modalBackdrop').style.display = 'flex';

    if (type === 'activity') {
        const a = data;
        document.getElementById('modalTitle').innerHTML = '📨 קיבלת פעילות';
        modalContent.innerHTML = '';

        const card = document.createElement('div');
        card.className = 'voice-summary';
        card.innerHTML =
            '<div class="voice-field"><span>📝 פעילות</span><strong>' + (a.title||'—') + '</strong></div>' +
            '<div class="voice-field"><span>📅 תאריך</span><strong>' + (a.date||'—') + '</strong></div>' +
            '<div class="voice-field"><span>⏰ שעה</span><strong>' + (a.time||'—') + '</strong></div>' +
            (a.repeatWeekly ? '<div class="voice-field"><span>🔁</span><strong>חוזר שבועי</strong></div>' : '') +
            (a.isTransport  ? '<div class="voice-field"><span>🚗</span><strong>הסעה</strong></div>' : '');
        modalContent.appendChild(card);

        const kidSel = document.createElement('div');
        kidSel.className = 'voice-kid-select';
        kidSel.innerHTML = '<label style="font-size:0.88rem;font-weight:600;color:var(--text-secondary)">הוסף לילד/ה:</label>';
        const sel = document.createElement('select');
        sel.className = 'date-input';
        sel.innerHTML = '<option value="">— בחרי —</option>';
        if (userKidsRef) {
            userKidsRef.once('value', snap => {
                Object.entries(snap.val() || {}).forEach(([id, k]) => { sel.innerHTML += '<option value="' + id + '">' + k.name + '</option>'; });
            });
        }
        kidSel.appendChild(sel);
        modalContent.appendChild(kidSel);

        const saveBtn = document.createElement('button');
        saveBtn.className = 'save-act-btn';
        saveBtn.style.marginTop = '12px';
        saveBtn.textContent = '✅ הוסף ללוח שלי';
        saveBtn.onclick = () => {
            const kidId = sel.value;
            if (!kidId) { showNotification('בחרי ילד/ה קודם', 'error'); return; }
            const newAct = Object.assign({}, a, { id: 'a_' + Date.now() });
            userKidsRef.child(kidId).child('activities').once('value', snap => {
                const list = snap.val() || [];
                const arr  = Array.isArray(list) ? list : Object.values(list);
                userKidsRef.child(kidId).child('activities').set([...arr, newAct])
                    .then(() => { document.getElementById('modalBackdrop').style.display = 'none'; showNotification('הפעילות נוספה ✓', 'success'); })
                    .catch(() => showNotification('שגיאה בשמירה', 'error'));
            });
        };
        modalContent.appendChild(saveBtn);

    } else {
        const kid = data;
        document.getElementById('modalTitle').innerHTML = '📨 קיבלת לוח ילד/ה';
        modalContent.innerHTML = '';
        const acts = Array.isArray(kid.activities) ? kid.activities : Object.values(kid.activities || {});
        const card = document.createElement('div');
        card.className = 'voice-summary';
        card.innerHTML = '<div class="voice-field"><span>👤 שם</span><strong>' + (kid.name||'—') + '</strong></div>' +
            '<div class="voice-field"><span>📋 פעילויות</span><strong>' + acts.length + '</strong></div>';
        modalContent.appendChild(card);
        const saveBtn = document.createElement('button');
        saveBtn.className = 'save-act-btn';
        saveBtn.style.marginTop = '12px';
        saveBtn.textContent = '✅ הוסף ללוח שלי';
        saveBtn.onclick = () => {
            const ref = userKidsRef.push();
            ref.set(Object.assign({}, kid, { id: ref.key }))
                .then(() => { document.getElementById('modalBackdrop').style.display = 'none'; showNotification(kid.name + ' נוסף/ה ✓', 'success'); })
                .catch(() => showNotification('שגיאה בשמירה', 'error'));
        };
        modalContent.appendChild(saveBtn);
    }
}

// ===== Global error handler =====
window.addEventListener('error', e => {
    console.error('JS Error:', e.error);
});