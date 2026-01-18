// Family Schedule App JavaScript - Enhanced Version

// Firebase Configuration
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

// Initialize Firebase
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

// Global Variables
let userKidsRef = null;
let userSettingsRef = null;
let currentTimelineView = 'daily';
let activeFilters = ['regular', 'transport', 'recurring', 'permanent']; 
let appSettings = { title: "הלוח שלי", entityName: "פעילות", defaultView: "daily" };
let isTimelineVisible = true;

// Utility Functions
const todayStr = () => new Date().toISOString().slice(0, 10);

// Initialize date filter
document.getElementById("dateFilter").value = todayStr();

// Show loading states
function showLoading(element) {
    if (element) {
        element.classList.add('loading');
    }
}

function hideLoading(element) {
    if (element) {
        element.classList.remove('loading');
    }
}

// Enhanced notification system
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? 'var(--success-gradient)' : 'var(--secondary-gradient)'};
        color: white;
        border-radius: var(--border-radius-sm);
        box-shadow: var(--shadow-lg);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Authentication State Management
auth.onAuthStateChanged(user => {
    const authSection = document.getElementById("auth-section");
    showLoading(authSection);
    
    if (user) {
        document.getElementById("user-status").textContent = `שלום, ${user.displayName}`;
        document.getElementById("loginBtn").style.display = "none";
        document.getElementById("logoutBtn").style.display = "inline-flex";
        document.getElementById("settingsBtn").style.display = "flex";
        document.getElementById("main-content").style.display = "block";
        
        userSettingsRef = db.ref(`users/${user.uid}/settings`);
        userSettingsRef.on("value", snap => {
            if (snap.exists()) {
                appSettings = snap.val();
                if (!window.initialLoadDone) {
                    currentTimelineView = appSettings.defaultView || 'daily';
                    window.initialLoadDone = true;
                }
                updateUI();
            }
            hideLoading(authSection);
        });

        userKidsRef = db.ref(`users/${user.uid}/kids`);
        userKidsRef.on("value", snapshot => {
            renderKids(snapshot.val());
            hideLoading(document.getElementById("kids-container"));
        });
        setupToggleBtn();
        showNotification('התחברת בהצלחה!', 'success');
    } else {
        document.getElementById("user-status").textContent = "אנא התחברי לצפייה בנתונים";
        document.getElementById("loginBtn").style.display = "inline-flex";
        document.getElementById("logoutBtn").style.display = "none";
        document.getElementById("settingsBtn").style.display = "none";
        document.getElementById("main-content").style.display = "none";
        userKidsRef = null;
        hideLoading(authSection);
    }
});
                updateUI();
            }
        });

        userKidsRef = db.ref(`users/${user.uid}/kids`);
        userKidsRef.on("value", snapshot => renderKids(snapshot.val()));
        setupToggleBtn();
    } else {
        document.getElementById("user-status").textContent = "אנא התחברי לצפייה בנתונים";
        document.getElementById("loginBtn").style.display = "inline-block";
        document.getElementById("logoutBtn").style.display = "none";
        document.getElementById("main-content").style.display = "none";
        userKidsRef = null;
    }
});

// UI Update Functions
function updateUI() {
    document.getElementById("app-title").textContent = appSettings.title;
    document.getElementById("page-title").textContent = appSettings.title;
    document.getElementById("addKidBtn").textContent = `הוספת ${appSettings.entityName}`;
    document.getElementById("viewDaily").classList.toggle('active', currentTimelineView === 'daily');
    document.getElementById("viewWeekly").classList.toggle('active', currentTimelineView === 'weekly');
}

function setupToggleBtn() {
    const btn = document.getElementById("toggleTimelineBtn");
    const content = document.getElementById("timeline-content-area");
    if (btn && content) {
        btn.onclick = () => {
            isTimelineVisible = !isTimelineVisible;
            content.style.display = isTimelineVisible ? "block" : "none";
            btn.textContent = isTimelineVisible ? "➖" : "➕";
        };
    }
}

// Generate random pastel color
function getPastelColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 92%)`;
}

// Main Rendering Functions
function renderKids(kids) {
    const container = document.getElementById("kids-container");
    const timelineList = document.getElementById("timeline-list");
    const timelineContainer = document.getElementById("family-timeline");
    container.innerHTML = "";
    timelineList.innerHTML = "";
    
    timelineContainer.style.display = kids ? "block" : "none";
    if (!kids) return;

    const selectedDate = document.getElementById("dateFilter").value;
    const baseDate = new Date(selectedDate);
    let allActivities = [];
    
    Object.keys(kids).forEach(kidId => {
        const kid = kids[kidId];
        const activities = kid.activities || [];
        
        const box = document.createElement("div");
        box.className = "kid-box";
        box.style.backgroundColor = getPastelColor();
        box.style.border = "1px solid rgba(0,0,0,0.05)";
        
        box.onclick = () => openKidModal(kidId, kid);
        
        const nameEl = document.createElement("div");
        nameEl.innerHTML = `<strong>${kid.name}</strong>`;
        nameEl.style.fontSize = "22px";
        nameEl.style.marginBottom = "10px";
        box.appendChild(nameEl);

        const actList = document.createElement("div");
        activities.forEach(a => {
            // Check if activity has expired
            const todayStr = new Date().toISOString().slice(0, 10);
            if (a.isPermanent && a.date < todayStr) {
                userKidsRef.child(kidId).child('activities').child(a.id).remove(); 
                return;
            }
        
            // Check if permanent activity should be displayed
            if (a.isPermanent && selectedDate > a.date) {
                return;
            }

            const isMatch = a.date === selectedDate || (a.repeatWeekly && new Date(a.date).getDay() === baseDate.getDay());
        
            // Display in personal boxes
            if (!a.isPermanent && isMatch) {
                const aEl = document.createElement("div");
                aEl.style.fontSize = "16px";
                aEl.textContent = `${formatTimeRange(a.time, a.endTime)} ${a.title}${a.isTransport ? ' 🚗' : ''}${a.repeatWeekly ? ' 🔁' : ''}`;
                actList.appendChild(aEl);
            }
            if (a.isPermanent) {
                const nDiv = document.createElement("div");
                nDiv.className = "permanent-note";
                nDiv.textContent = `📌 ${a.title}`;
                actList.appendChild(nDiv);
            }

            // Filter logic for family timeline
            const type = a.isTransport ? 'transport' : (a.repeatWeekly ? 'recurring' : (a.isPermanent ? 'permanent' : 'regular'));
            
            if (!activeFilters.includes(type)) return;

            const checkTimelineMatch = (dStr) => {
                const d = new Date(dStr);
                if (a.isPermanent) return a.date === dStr;
                return a.date === dStr || (a.repeatWeekly && new Date(a.date).getDay() === d.getDay());
            };

            if (currentTimelineView === 'daily') {
                if (checkTimelineMatch(selectedDate)) allActivities.push({ ...a, kidName: kid.name, displayDate: selectedDate });
            } else {
                for (let i = 0; i < 7; i++) {
                    let t = new Date(baseDate); t.setDate(baseDate.getDate() + i);
                    let ts = t.toISOString().slice(0, 10);
                    if (checkTimelineMatch(ts)) allActivities.push({ ...a, kidName: kid.name, displayDate: ts });
                }
            }
        });

        box.appendChild(actList);
        const del = document.createElement("span");
        del.className = "delete-kid"; del.innerHTML = "&times;";
        del.onclick = (e) => { e.stopPropagation(); if(confirm(`למחוק את ${kid.name}?`)) userKidsRef.child(kidId).remove(); };
        box.appendChild(del);
        container.appendChild(box);
    });

    renderTimelineList(allActivities, timelineList, timelineContainer);
}

function renderTimelineList(allActivities, timelineList, timelineContainer) {
    timelineContainer.style.display = "block";
    timelineList.innerHTML = "";

    if (allActivities.length > 0) {
        allActivities.sort((a, b) => a.displayDate.localeCompare(b.displayDate) || (a.time || "99:99").localeCompare(b.time || "99:99"));

        let lastHeader = "";
        allActivities.forEach(act => {
            if (currentTimelineView === 'weekly' && act.displayDate !== lastHeader) {
                const header = document.createElement("div");
                header.style = "background:#eee; padding:4px 8px; font-size:12px; font-weight:bold; margin-top:10px; border-radius:4px; border-right: 3px solid #4CAF50;";
                header.textContent = act.displayDate.split('-').reverse().join('/');
                timelineList.appendChild(header);
                lastHeader = act.displayDate;
            }
           
            // Transport icon logic
            let transportHtml = "";
            if (act.isTransport) {
                const isReturn = act.isReturn;
                const style = isReturn 
                    ? "display: inline-block; transform: scaleX(-1); filter: hue-rotate(150deg); drop-shadow(0 0 2px orange);" 
                    : "display: inline-block;";
                
                transportHtml = `<span style="${style}" title="${isReturn ? 'חזור' : 'הלוך'}">🚗</span>`;
            }
            const item = document.createElement("div");
            item.className = "timeline-item";
            item.innerHTML = `
                <span class="timeline-time">${formatTimeRange(act.time, act.endTime)}</span>
                <span class="timeline-content">
                    <span class="timeline-kid-name">${act.kidName}</span> 
                    ${act.isPermanent ? '📌 ' : ''}${act.title} ${transportHtml} ${act.repeatWeekly ? '🔁' : ''}
                </span>`;
            timelineList.appendChild(item);
        });
        document.getElementById("whatsappShareBtn").style.opacity = "1";
        document.getElementById("whatsappShareBtn").disabled = false;
    } else {
        timelineList.innerHTML = "<div style='text-align:center; padding:20px; color:#999;'>אין פעילויות להצגה בסינון זה</div>";
        document.getElementById("whatsappShareBtn").style.opacity = "0.5";
        document.getElementById("whatsappShareBtn").disabled = true;
    }
}   

// Sharing Functions
function shareActivity(kidName, a) {
    const data = btoa(unescape(encodeURIComponent(JSON.stringify(a))));
    const url = `${window.location.origin}${window.location.pathname}?sharedAct=${data}`;
    const txt = `פעילות עבור ${kidName}: ${a.title}. להוספה: ${url}`;
    if (navigator.share) navigator.share({ title: 'שיתוף', text: txt, url: url });
    else { navigator.clipboard.writeText(txt); alert("הועתק ללוח!"); }
}

function shareEntireKid(kidId, kidName) {
    userKidsRef.child(kidId).once("value", snap => {
        const data = btoa(unescape(encodeURIComponent(JSON.stringify(snap.val()))));
        const url = `${window.location.origin}${window.location.pathname}?sharedKid=${data}`;
        if (navigator.share) navigator.share({ title: kidName, url: url });
        else { navigator.clipboard.writeText(url); alert("קישור הועתק!"); }
    });
}

function formatTimeRange(start, end) {
    if (!start) return "--:--";
    if (!end) return start;
    return `${start}-${end}`;
}

// Modal Functions
function openKidModal(kidId, kid, activityToEdit = null) {
    const modalContent = document.getElementById("modalContent");
    document.getElementById("modalTitle").innerHTML = activityToEdit ? `עריכה` : kid.name;
    modalContent.innerHTML = "";
    document.getElementById("modalBackdrop").style.display = "flex";
    const activities = kid.activities || [];

    if (!activityToEdit) {
        const shareBtn = document.createElement("button");
        shareBtn.innerHTML = "🔗 שיתוף לוח אישי";
        shareBtn.style = "margin-bottom:15px; background:#10b981; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; width:100%; font-weight:bold;";
        shareBtn.onclick = () => shareEntireKid(kidId, kid.name);
        modalContent.appendChild(shareBtn);

        const list = document.createElement("div");
        activities.sort((a,b) => a.date.localeCompare(b.date)).forEach(a => {
            const item = document.createElement("div");
            item.className = "activity-item";
            const dateFmt = a.date.split('-').reverse().join('/');
            const icons = `${a.isPermanent ? '📌' : ''}${a.isTransport ? '🚗' : ''}${a.repeatWeekly ? '🔁' : ''}`;
            item.innerHTML = `<span>${dateFmt} | ${formatTimeRange(a.time, a.endTime)} ${a.title} ${icons}</span>
                <div style="display:flex; gap:5px;">
                    <button onclick="event.stopPropagation(); shareActivity('${kid.name}', ${JSON.stringify(a).replace(/"/g, '&quot;')})" style="background:#10b981; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer;">🔗</button>
                    <button class="btn-edit" onclick="event.stopPropagation(); openKidModal('${kidId}', ${JSON.stringify(kid).replace(/"/g, '&quot;')}, ${JSON.stringify(a).replace(/"/g, '&quot;')})">✏️</button>
                    <button class="btn-delete" onclick="event.stopPropagation(); deleteActivity('${kidId}', '${a.id}')">🗑️</button>
                </div>`;
            list.appendChild(item);
        });
        modalContent.appendChild(list);
    }

    const form = document.createElement("div");
    form.className = "add-activity-form";
    const dDate = activityToEdit ? activityToEdit.date : todayStr();
    form.innerHTML = `
        <input type="date" id="newActDate" value="${dDate}">
        <input type="text" id="newActTitle" placeholder="מה עושים?" value="${activityToEdit ? activityToEdit.title : ''}">
         <div style="display: flex; align-items: center; gap: 5px; font-size: 12px;">
            <span>משעה:</span>
            <input type="time" id="newActTime" style="width: auto;" value="${activityToEdit ? activityToEdit.time : ''}">
            <span>-</span>
            <span>עד שעה:</span>
            <input type="time" id="newActEndTime" style="width: auto;" value="${activityToEdit ? activityToEdit.endTime : ''}">
         </div>
       
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; font-size:12px; margin-top:5px;">
            <label><input type="checkbox" id="newActPerm" ${activityToEdit?.isPermanent ? 'checked' : ''}> קבוע</label>
            <label><input type="checkbox" id="newActRepeat" ${activityToEdit?.repeatWeekly ? 'checked' : ''}> חוזר</label>
            <label><input type="checkbox" id="newActTrans"  onchange="document.getElementById('returnOption').style.display = this.checked ? 'block' : 'none'" ${activityToEdit?.isTransport ? 'checked' : ''}> הסעה 🚗</label>
        </div>
  
        <div id="returnOption" style="display: ${activityToEdit?.isTransport ? 'block' : 'none'}; margin-top: 5px; font-size: 12px; border-top: 1px dotted #ccc; pt: 5px;">
            <label style="color: #e67e22;">
                <input type="checkbox" id="newActIsReturn" ${activityToEdit?.isReturn ? 'checked' : ''}> האם זו הסעה חזור? (הביתה) 🏠
            </label>
        </div>
        <button id="saveActBtn" style="margin-top:10px; padding:10px; background:#4CAF50; color:white; border:none; border-radius:6px; cursor:pointer;">שמור</button>
    `;
    modalContent.appendChild(form);

    document.getElementById("saveActBtn").onclick = () => {
        const title = document.getElementById("newActTitle").value;
        const date = document.getElementById("newActDate").value;
        if (!title || !date) return alert("חובה למלא הכל");
        const newAct = {
            id: activityToEdit ? activityToEdit.id : "a_" + Date.now(),
            title, 
            date, 
            time: document.getElementById("newActTime").value || "",
            endTime: document.getElementById("newActEndTime").value || "",
            isPermanent: document.getElementById("newActPerm").checked,
            repeatWeekly: document.getElementById("newActRepeat").checked,
            isTransport: document.getElementById("newActTrans").checked,
            isReturn: document.getElementById("newActIsReturn").checked
        };
       
        const newList = activityToEdit ? activities.map(a => a.id === activityToEdit.id ? newAct : a) : [...activities, newAct];
        userKidsRef.child(kidId).child("activities").set(newList).then(() => {
            userKidsRef.child(kidId).once("value", s => openKidModal(kidId, s.val()));
        });
    };
}

// Activity deletion function
window.deleteActivity = (kidId, actId) => {
    if(!confirm("למחוק את הפעילות?")) return;
    
    userKidsRef.child(kidId).child("activities").once("value", snap => {
        const currentActivities = snap.val() || [];
        const filtered = currentActivities.filter(a => String(a.id) !== String(actId));
        
        userKidsRef.child(kidId).child("activities").set(filtered).then(() => {
            userKidsRef.child(kidId).once("value", s => {
                if (s.exists()) {
                    openKidModal(kidId, s.val());
                } else {
                    document.getElementById("modalBackdrop").style.display = "none";
                }
            });
        }).catch(err => console.error("מחיקה נכשלה:", err));
    });
};

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const filterBtn = document.getElementById("filterDropdownBtn");
    const filterMenu = document.getElementById("filterMenu");

    if(filterBtn) {
        filterBtn.onclick = (e) => {
            e.stopPropagation();
            filterMenu.style.display = filterMenu.style.display === "none" ? "block" : "none";
        };
    }

    document.onclick = () => { if(filterMenu) filterMenu.style.display = "none"; };
    if(filterMenu) filterMenu.onclick = (e) => e.stopPropagation();

    document.querySelectorAll('.filter-check').forEach(checkbox => {
        checkbox.onchange = () => {
            activeFilters = Array.from(document.querySelectorAll('.filter-check:checked')).map(cb => cb.value);
            if (userKidsRef) userKidsRef.once("value", s => renderKids(s.val()));
        };
    });
});

// Button Event Handlers
document.getElementById("viewDaily").onclick = () => { 
    currentTimelineView = 'daily'; 
    updateUI(); 
    userKidsRef.once("value", s => renderKids(s.val())); 
};

document.getElementById("viewWeekly").onclick = () => { 
    currentTimelineView = 'weekly'; 
    updateUI(); 
    userKidsRef.once("value", s => renderKids(s.val())); 
};

document.getElementById("refreshBtn").onclick = () => 
    userKidsRef.once("value", snap => renderKids(snap.val()));

document.getElementById("closeModal").onclick = () => 
    document.getElementById("modalBackdrop").style.display = "none";

document.getElementById("loginBtn").onclick = () => 
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());

document.getElementById("logoutBtn").onclick = () => auth.signOut();

document.getElementById("addKidBtn").onclick = () => {
    const name = prompt(`שם ה${appSettings.entityName}:`);
    if (name && userKidsRef) {
        const ref = userKidsRef.push();
        ref.set({ id: ref.key, name, activities: [] });
    }
};

document.getElementById("whatsappShareBtn").onclick = () => {
    const items = document.querySelectorAll(".timeline-item");
    if (items.length === 0) {
        showNotification("אין פעילויות לשיתוף", "error");
        return;
    }
    let msg = `*📅 לו"ז ${appSettings.title}:*\n`;
    Array.from(document.getElementById("timeline-list").children).forEach(el => {
        if (el.style.fontWeight === "bold") msg += `\n*${el.textContent}*\n`;
        else msg += `⏰ ${el.querySelector(".timeline-time").textContent} - ${el.querySelector(".timeline-content").textContent.trim()}\n`;
    });
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
    showNotification("נפתח בוואטסאפ!", "success");
};

// Settings functionality
document.getElementById("settingsBtn").onclick = () => {
    document.getElementById("settingsTitle").value = appSettings.title || "הלוח שלי";
    document.getElementById("settingsEntityName").value = appSettings.entityName || "פעילויות";
    document.getElementById("settingsDefaultView").value = appSettings.defaultView || "daily";
    document.getElementById("settingsModalBackdrop").style.display = "flex";
};

document.getElementById("saveSettingsBtn").onclick = () => {
    const newSettings = {
        title: document.getElementById("settingsTitle").value || "הלוח שלי",
        entityName: document.getElementById("settingsEntityName").value || "פעילויות",
        defaultView: document.getElementById("settingsDefaultView").value || "daily"
    };
    
    if (userSettingsRef) {
        showLoading(document.getElementById("saveSettingsBtn"));
        userSettingsRef.set(newSettings).then(() => {
            appSettings = newSettings;
            updateUI();
            document.getElementById("settingsModalBackdrop").style.display = "none";
            hideLoading(document.getElementById("saveSettingsBtn"));
            showNotification("הגדרות נשמרו בהצלחה!", "success");
        }).catch(error => {
            hideLoading(document.getElementById("saveSettingsBtn"));
            showNotification("שגיאה בשמירת הגדרות", "error");
            console.error("Error saving settings:", error);
        });
    }
};

// Enhanced error handling
window.addEventListener('error', function(e) {
    console.error('JavaScript Error:', e.error);
    showNotification("אירעה שגיאה. אנא נסה שוב.", "error");
});

// Add smooth scrolling to new items
function smoothScrollToElement(element) {
    element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'nearest',
        inline: 'nearest'
    });
}
