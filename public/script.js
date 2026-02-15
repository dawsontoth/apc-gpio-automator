const socket = io();
const groupsDiv = document.getElementById('groups');
const infoDialog = document.getElementById('info-dialog');
const infoContent = document.getElementById('info-content');
const filterInput = document.getElementById('filter-input');
const clearFilterBtn = document.getElementById('clear-filter');

let lastState = null;
let expandedGroups = new Set();
let confirmingGroup = null; // { name, action, timeout }
let filterText = '';

socket.on('state', (state) => {
    lastState = state;
    render(state);
});

filterInput.addEventListener('input', (e) => {
    filterText = e.target.value.toLowerCase();
    clearFilterBtn.classList.toggle('hidden', filterText === '');
    render(lastState);
});

clearFilterBtn.addEventListener('click', () => {
    filterInput.value = '';
    filterText = '';
    clearFilterBtn.classList.add('hidden');
    render(lastState);
});

function toggleCollapse(groupName) {
    if (expandedGroups.has(groupName)) {
        expandedGroups.delete(groupName);
    } else {
        expandedGroups.add(groupName);
    }
    render(lastState);
}

function render(state) {
    if (!state) return;
    groupsDiv.innerHTML = '';
    
    let groupsToRender = state.groups;
    if (filterText) {
        groupsToRender = {};
        for (const groupName in state.groups) {
            const groupMatches = groupName.toLowerCase().includes(filterText);
            const outlets = state.groups[groupName].filter(outlet => 
                groupMatches ||
                outlet.name.toLowerCase().includes(filterText) ||
                (outlet.location && outlet.location.toLowerCase().includes(filterText))
            );
            if (outlets.length > 0) {
                groupsToRender[groupName] = outlets;
            }
        }
    }

    const groupNames = Object.keys(groupsToRender).sort();
    
    // Put 'Other' at the end
    const otherIdx = groupNames.indexOf('Other');
    if (otherIdx > -1) {
        groupNames.splice(otherIdx, 1);
        groupNames.push('Other');
    }

    if (groupNames.length === 0) {
        groupsDiv.innerHTML = `<p style="text-align: center; color: var(--text-muted);">${filterText ? 'No outlets match your search.' : 'No PDUs discovered yet.'}</p>`;
        return;
    }

    groupNames.forEach(groupName => {
        const groupOutlets = groupsToRender[groupName];
        if (groupOutlets.length === 0) return;

        const isExpanded = expandedGroups.has(groupName) || filterText !== ''; // Auto-expand when filtering
        const isAllOn = groupOutlets.every(o => o.state === 'on');
        const isConfirming = confirmingGroup && confirmingGroup.name === groupName;

        const card = document.createElement('div');
        card.className = `group-card${isExpanded ? ' expanded' : ''}`;

        const header = document.createElement('div');
        header.className = 'group-header';
        header.onclick = (e) => {
            if (e.target.closest('.switch') || e.target.closest('.confirm-btn')) return;
            toggleCollapse(groupName);
        };

        let controlsHtml = '';
        if (isConfirming) {
            controlsHtml = `
                <div class="confirm-actions">
                    <button class="confirm-btn confirm-no" onclick="cancelGroupToggle()">Cancel</button>
                    <button class="confirm-btn confirm-yes ${confirmingGroup.action === 'off' ? 'action-off' : ''}" onclick="executeGroupToggle()">
                        Confirm ${confirmingGroup.action.toUpperCase()}
                    </button>
                </div>
            `;
        } else {
            controlsHtml = `
                <label class="switch group-switch">
                    <input type="checkbox" ${isAllOn ? 'checked' : ''} onchange="toggleGroup('${groupName}', this.checked)">
                    <span class="slider"></span>
                </label>
            `;
        }

        header.innerHTML = `
            <div class="group-name">${groupName}</div>
            ${controlsHtml}
        `;
        card.appendChild(header);

        const list = document.createElement('div');
        list.className = 'outlet-list';

        groupOutlets.forEach(outlet => {
            const item = document.createElement('div');
            item.className = 'outlet-item';
            
            item.innerHTML = `
                <div class="outlet-info">
                    <div class="outlet-label">
                        <span class="outlet-name">${outlet.name}</span>
                        ${!outlet.host.startsWith('GPIO') 
                            ? `<a href="http://${outlet.host}" target="_blank" class="outlet-location pdu-link">${outlet.location}</a>` 
                            : `<span class="outlet-location">${outlet.location}</span>`}
                    </div>
                </div>
                <div class="outlet-controls">
                    <button class="info-btn" onclick="showInfo('${outlet.host}', ${outlet.index})" title="Details">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                    </button>
                    <label class="switch">
                        <input type="checkbox" ${outlet.state === 'on' ? 'checked' : ''} onchange="triggerOutlet('${outlet.host}', ${outlet.index}, this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>
            `;
            list.appendChild(item);
        });

        card.appendChild(list);
        groupsDiv.appendChild(card);
    });
}

function toggleGroup(group, isChecked) {
    const action = isChecked ? 'on' : 'off';
    
    if (confirmingGroup) {
        clearTimeout(confirmingGroup.timeout);
    }

    confirmingGroup = {
        name: group,
        action: action,
        timeout: setTimeout(() => {
            confirmingGroup = null;
            render(lastState);
        }, 5000)
    };
    
    render(lastState);
}

function executeGroupToggle() {
    if (!confirmingGroup) return;
    const { name, action, timeout } = confirmingGroup;
    clearTimeout(timeout);
    socket.emit('triggerGroup', { group: name, action });
    confirmingGroup = null;
    render(lastState);
}

function cancelGroupToggle() {
    if (!confirmingGroup) return;
    clearTimeout(confirmingGroup.timeout);
    confirmingGroup = null;
    render(lastState);
}

function triggerOutlet(host, index, isChecked) {
    const action = isChecked ? 'on' : 'off';
    socket.emit('triggerOutlet', { host, index, action });
}

function showInfo(host, index) {
    if (!lastState) return;
    
    // Find outlet in any group
    let outlet = null;
    for (const group in lastState.groups) {
        outlet = lastState.groups[group].find(o => o.host === host && o.index === index);
        if (outlet) break;
    }

    if (!outlet) return;

    infoContent.innerHTML = `
        <div class="info-label">Name</div>
        <div class="info-value">${outlet.name}</div>
        
        <div class="info-label">Location</div>
        <div class="info-value">${outlet.location}</div>
        
        <div class="info-label">PDU Name</div>
        <div class="info-value">${outlet.pduName}</div>
        
        <div class="info-label">Host</div>
        <div class="info-value">${!outlet.host.startsWith('GPIO') ? `<a href="http://${outlet.host}" target="_blank" class="pdu-link">${outlet.host}</a>` : outlet.host}</div>
        
        <div class="info-label">Index</div>
        <div class="info-value">${outlet.index}</div>
        
        <div class="info-label">Type</div>
        <div class="info-value">${outlet.type}</div>
        
        <div class="info-label">Status</div>
        <div class="info-value" style="color: ${outlet.state === 'on' ? 'var(--on-color)' : 'var(--off-color)'}; font-weight: bold;">
            ${outlet.state.toUpperCase()}
        </div>
    `;
    
    infoDialog.showModal();
}