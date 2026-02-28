const socket = io();
const groupsDiv = document.getElementById('groups');
const specialActionsDiv = document.getElementById('special-actions');
const infoDialog = document.getElementById('info-dialog');
const infoContent = document.getElementById('info-content');
const filterInput = document.getElementById('filter-input');
const clearFilterBtn = document.getElementById('clear-filter');
const discoverBtn = document.getElementById('discover-btn');

let lastState = null;
let expandedGroups = new Set();
let confirmingGroup = null; // { name, action, timeout }
let filterText = '';

socket.on('state', (state) => {
    lastState = state;
    discoverBtn.classList.remove('spinning');
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

discoverBtn.addEventListener('click', () => {
    discoverBtn.classList.add('spinning');
    socket.emit('discoverDevices');
    // The 'state' update will eventually come back and we can stop spinning then,
    // but for now let's just let it spin for a bit if we don't have a specific 'discoveryComplete' event.
    // Actually, when 'state' is received, we can stop spinning.
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

    // Render Special Actions
    if (state.specialActions && state.specialActions.length > 0) {
        specialActionsDiv.classList.remove('hidden');
        specialActionsDiv.innerHTML = '';
        state.specialActions.forEach(action => {
            const item = document.createElement('div');
            item.className = 'special-action-item';
            const isOn = action.state === 'on';
            item.innerHTML = `
                <span class="special-action-name">${action.name}</span>
                <label class="switch">
                    <input type="checkbox" ${isOn ? 'checked' : ''} onchange="triggerSpecialAction('${action.name}', this.checked)">
                    <span class="slider"></span>
                </label>
            `;
            specialActionsDiv.appendChild(item);
        });
    } else {
        specialActionsDiv.classList.add('hidden');
    }
    
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
        const isWorking = state.workingGroups && state.workingGroups.includes(groupName);
        const isConfirming = confirmingGroup && confirmingGroup.name === groupName;

        const card = document.createElement('div');
        const groupConfig = state.groupConfigs && state.groupConfigs[groupName];
        const colorClass = groupConfig && groupConfig.ledColor ? ` color-${groupConfig.ledColor}` : '';
        card.className = `group-card${isExpanded ? ' expanded' : ''}${colorClass}`;

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
            <div class="group-name">
                ${groupName}
                ${isWorking ? '<span class="working-indicator"></span>' : ''}
            </div>
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
                        <span class="outlet-location">
                            ${!outlet.host.startsWith('GPIO')
                              ? `<a href="http://${outlet.host}" target="_blank" class="pdu-link">${outlet.location}</a>`
                              : outlet.location}
                        </span>
                    </div>
                </div>
                <div class="outlet-controls">
                    <button class="info-btn" onclick="showInfo('${outlet.host}', '${outlet.index}')" title="Details">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                    </button>
                    <label class="switch">
                        <input type="checkbox" ${outlet.state === 'on' ? 'checked' : ''} onchange="triggerOutlet('${outlet.host}', '${outlet.index}', this.checked)">
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

window.triggerSpecialAction = function(name, isChecked) {
    const action = isChecked ? 'on' : 'off';
    socket.emit('triggerSpecialAction', { name, action });
};

function showInfo(host, index) {
    if (!lastState) return;
    
    // Find outlet in any group
    let outlet = null;
    for (const group in lastState.groups) {
        outlet = lastState.groups[group].find(o => o.host === host && o.index === index);
        if (outlet) break;
    }

    if (!outlet) return;

    const isManual = host === 'Manual';
    
    let html = `
        <div class="info-label">Name</div>
        <div class="info-value name-edit-row">
            <input type="text" id="edit-outlet-name" value="${outlet.name}" class="edit-input">
        </div>
    `;

    if (isManual) {
        html += `
            <div class="info-label">On Command</div>
            <div class="info-value">
                <input type="text" id="edit-on-command" value="${outlet.onCommand || ''}" class="edit-input">
            </div>
            <div class="info-label">Off Command</div>
            <div class="info-value">
                <input type="text" id="edit-off-command" value="${outlet.offCommand || ''}" class="edit-input">
            </div>
        `;
    } else {
        html += `
            <div class="info-label">Location</div>
            <div class="info-value">${outlet.location}</div>
            
            <div class="info-label">PDU Name</div>
            <div class="info-value">${outlet.pduName}</div>
            
            <div class="info-label">Host</div>
            <div class="info-value">${!outlet.host.startsWith('GPIO') ? `<a href="http://${outlet.host}" target="_blank" class="pdu-link">${outlet.host}</a>` : outlet.host}</div>
            
            <div class="info-label">Index</div>
            <div class="info-value">${outlet.index}</div>
        `;
    }

    html += `
        <div class="info-label">Delay On (s)</div>
        <div class="info-value">
            <input type="number" id="edit-delay-on" value="${outlet.delayOnSeconds || ''}" class="edit-input" placeholder="None">
        </div>

        <div class="info-label">Delay Off (s)</div>
        <div class="info-value">
            <input type="number" id="edit-delay-off" value="${outlet.delayOffSeconds || ''}" class="edit-input" placeholder="None">
        </div>

        <div class="info-label">Type</div>
        <div class="info-value">${outlet.type}</div>
        
        <div class="info-label">Status</div>
        <div class="info-value" style="color: ${outlet.state === 'on' ? 'var(--on-color)' : 'var(--off-color)'}; font-weight: bold;">
            ${outlet.state.toUpperCase()}
        </div>

        <div class="info-label"></div>
        <div class="info-value">
            <button class="save-btn" onclick="saveDetails('${outlet.host}', '${outlet.index}')">Save Changes</button>
        </div>
    `;

    infoContent.innerHTML = html;
    infoDialog.showModal();
}

window.saveDetails = function(host, index) {
    const name = document.getElementById('edit-outlet-name').value.trim();
    const delayOnSeconds = parseInt(document.getElementById('edit-delay-on').value, 10);
    const delayOffSeconds = parseInt(document.getElementById('edit-delay-off').value, 10);
    
    const updates = {
        host,
        index,
        name,
        delayOnSeconds: isNaN(delayOnSeconds) ? null : delayOnSeconds,
        delayOffSeconds: isNaN(delayOffSeconds) ? null : delayOffSeconds
    };

    if (host === 'Manual') {
        updates.onCommand = document.getElementById('edit-on-command').value.trim();
        updates.offCommand = document.getElementById('edit-off-command').value.trim();
    }

    socket.emit('updateOutletDetails', updates);
    infoDialog.close();
};