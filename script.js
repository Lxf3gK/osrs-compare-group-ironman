const groupUrl = "https://secure.runescape.com/m=hiscore_oldschool_ironman/group-ironman/view-group?name=MissedFlicks";
const corsProxy = "https://corsproxy.io/?";

async function fetchGroupData() {
    const response = await fetch(corsProxy + encodeURIComponent(groupUrl));
    if (!response.ok) throw new Error("Failed to fetch group hiscores");
    const html = await response.text();
    return html;
}

function parseGroupData(html) {
    // Create a DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    // Find the only table with class 'uc-scroll__table'
    const table = doc.querySelector("table.uc-scroll__table");
    if (!table) return null;
    // Get all rows
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    if (rows.length < 1) return null;
    // Find all member rows (rows where first cell, after trimming, ends with 'Expand')
    const memberIndices = [];
    rows.forEach((row, i) => {
        const cell = row.querySelector('td');
        if (!cell) return;
        const text = cell.textContent.replace(/\s+/g, ' ').trim();
        if (text.endsWith('Expand')) memberIndices.push(i);
    });
    if (memberIndices.length !== 2) return null; // Only support 2 members for now
    const memberNames = memberIndices.map(idx => {
        const cell = rows[idx].querySelector('td');
        return cell.textContent
            .replace(/\s+/g, ' ')
            .replace(/ Expand\s*$/, '')
            .replace(/[?�]/g, ' ')
            .trim();
    });
    // Get total level/xp for each member (from the member row itself)
    const member1TotalTds = Array.from(rows[memberIndices[0]].querySelectorAll('td'));
    const member2TotalTds = Array.from(rows[memberIndices[1]].querySelectorAll('td'));
    const total = {
        skill: 'Total',
        member1: { level: member1TotalTds[1]?.textContent.trim() || '', xp: member1TotalTds[2]?.textContent.trim() || '' },
        member2: { level: member2TotalTds[1]?.textContent.trim() || '', xp: member2TotalTds[2]?.textContent.trim() || '' }
    };
    // Skill rows for each member
    const member1SkillRows = rows.slice(memberIndices[0] + 1, memberIndices[1]);
    const member2SkillRows = rows.slice(memberIndices[1] + 1);
    const skillCount = Math.min(member1SkillRows.length, member2SkillRows.length);
    const skills = [];
    for (let i = 0; i < skillCount; i++) {
        const tds1 = Array.from(member1SkillRows[i].querySelectorAll('td'));
        const tds2 = Array.from(member2SkillRows[i].querySelectorAll('td'));
        skills.push({
            skill: tds1[0]?.textContent.trim() || '',
            member1: { level: tds1[1]?.textContent.trim() || '', xp: tds1[2]?.textContent.trim() || '' },
            member2: { level: tds2[1]?.textContent.trim() || '', xp: tds2[2]?.textContent.trim() || '' }
        });
    }
    // Insert total row at the top
    skills.unshift(total);
    return { memberNames, skills };
}

let hideZeroXpState = false;
let container = null;

// Get the main container for the comparison table
// const container = document.getElementById("comparison-table-container");

function renderComparisonTable(data, sortState) {
    if (!data) {
        container.innerHTML = "<p>Could not load group data.</p>";
        return;
    }
    // Save scroll position of the table container (by id)
    const prevScrollDiv = document.getElementById('table-scroll');
    let prevScrollLeft = prevScrollDiv ? prevScrollDiv.scrollLeft : 0;
    // Determine if there are any matching 0 XP rows (excluding total row)
    const hasMatchingZeroXp = data.skills.slice(1).some(row => {
        const xp1 = parseInt(row.member1.xp.replace(/,/g, '')) || 0;
        const xp2 = parseInt(row.member2.xp.replace(/,/g, '')) || 0;
        return xp1 === 0 && xp2 === 0;
    });
    // Add hide-zero-xp checkbox above the table only if needed
    let controlsHtml = '';
    if (hasMatchingZeroXp) {
        controlsHtml = `<div style="margin-bottom:12px;">
            <label style="cursor:pointer;font-size:1em;">
                <input type="checkbox" id="hide-zero-xp" style="vertical-align:middle;margin-right:6px;"${hideZeroXpState ? ' checked' : ''}> Hide matching 0 XP
            </label>
        </div>`;
    }
    // Filter rows if hide-zero-xp is checked (make a filtered copy, don't mutate input)
    let filteredSkills = data.skills;
    if (hideZeroXpState) {
        filteredSkills = data.skills.filter((row, idx) => {
            if (idx === 0) return true; // Always keep total row
            const xp1 = parseInt(row.member1.xp.replace(/,/g, '')) || 0;
            const xp2 = parseInt(row.member2.xp.replace(/,/g, '')) || 0;
            return xp1 !== 0 || xp2 !== 0;
        });
    }
    // Build header row 1: member names
    let html = '<div id="table-scroll" style="overflow-x:auto;"><table><thead>';
    html += '<tr>' +
        '<th class="skill-col" style="border-right:3px solid #232323;"></th>' +
        `<th class="level-col" colspan="2" style="border-right:3px solid #232323;">${data.memberNames[0] || ''}</th>` +
        `<th class="swap-col" style="border-right:3px solid #232323;text-align:center;vertical-align:middle;" rowspan="2">` +
        `<button id="swap-members" title="Swap members" style="background:#232323;color:#fff;border-radius:50%;border:none;cursor:pointer;">&#x21C6;</button>` +
        `</th>` +
        `<th class="level-col" colspan="2" style="border-right:3px solid #232323;">${data.memberNames[1] || ''}</th>` +
        '<th class="xpdiff-col" style="border-left:3px solid #232323;"></th>' +
        '</tr>';
    // Build header row 2: column headers
    html += '<tr>' +
        `<th class="skill-col sort-header" id="sort-skill-th" style="text-align:left;border-right:3px solid #232323;">` +
        `<button id="sort-skill" style="background:none;border:none;color:inherit;font:inherit;cursor:pointer;padding:0;width:100%;height:100%;text-align:left;">Skill <span id="sort-skill-arrow" style="font-size:0.9em;">${sortState && sortState.member==='skill' ? (sortState.order==='asc'?'&#x25B2;':(sortState.order==='desc'?'&#x25BC;':'')) : ''}</span></button>` +
        `</th>` +
        `<th class="level-col sort-header" id="sort-level-member1-th" style="text-align:right;">` +
        `<button id="sort-level-member1" style="background:none;border:none;color:inherit;font:inherit;cursor:pointer;padding:0;width:100%;height:100%;text-align:right;">Level <span id="sort-lvl-m1" style="font-size:0.9em;">${sortState && sortState.member==='member1-level' ? (sortState.order==='asc'?'&#x25B2;':(sortState.order==='desc'?'&#x25BC;':'')) : ''}</span></button>` +
        `</th>` +
        `<th class="xp-col sort-header" id="sort-member1-th" style="text-align:right;border-right:3px solid #232323;">` +
        `<button id="sort-member1" style="background:none;border:none;color:inherit;font:inherit;cursor:pointer;padding:0;width:100%;height:100%;text-align:right;">XP <span id="sort-m1" style="font-size:0.9em;">${sortState && sortState.member==='member1' ? (sortState.order==='asc'?'&#x25B2;':(sortState.order==='desc'?'&#x25BC;':'')) : ''}</span></button>` +
        `</th>` +
        // swap-col is rowspan=2, so skip here
        `<th class="level-col sort-header" id="sort-level-member2-th" style="text-align:right;">` +
        `<button id="sort-level-member2" style="background:none;border:none;color:inherit;font:inherit;cursor:pointer;padding:0;width:100%;height:100%;text-align:right;">Level <span id="sort-lvl-m2" style="font-size:0.9em;">${sortState && sortState.member==='member2-level' ? (sortState.order==='asc'?'&#x25B2;':(sortState.order==='desc'?'&#x25BC;':'')) : ''}</span></button>` +
        `</th>` +
        `<th class="xp-col sort-header" id="sort-member2-th" style="text-align:right;">` +
        `<button id="sort-member2" style="background:none;border:none;color:inherit;font:inherit;cursor:pointer;padding:0;width:100%;height:100%;text-align:right;">XP <span id="sort-m2" style="font-size:0.9em;">${sortState && sortState.member==='member2' ? (sortState.order==='asc'?'&#x25B2;':(sortState.order==='desc'?'&#x25BC;':'')) : ''}</span></button>` +
        `</th>` +
        `<th class="xpdiff-col sort-header" id="sort-xpdiff-th" style="text-align:right;border-left:3px solid #232323;">` +
        `<button id="sort-xpdiff" style="background:none;border:none;color:inherit;font:inherit;cursor:pointer;padding:0;width:100%;height:100%;text-align:right;">XP Diff <span id="sort-xpdiff-arrow" style="font-size:0.9em;">${sortState && sortState.member==='xpdiff' ? (sortState.order==='asc'?'&#x25B2;':(sortState.order==='desc'?'&#x25BC;':'')) : ''}</span></button>` +
        `</th>` +
        '</tr>';
    html += '</thead><tbody>';
    // Skill rows
    filteredSkills.forEach((skillRow, idx) => {
        let rowClass = '';
        let arrow = '';
        const xp1 = parseInt(skillRow.member1.xp.replace(/,/g, ''));
        const xp2 = parseInt(skillRow.member2.xp.replace(/,/g, ''));
        let diff = '';
        if (!isNaN(xp1) && !isNaN(xp2)) {
            diff = (xp1 - xp2).toLocaleString();
        }
        if (idx === 0) {
            rowClass = 'total-row';
            // Add comparison arrow for total row
            if (!isNaN(xp1) && !isNaN(xp2)) {
                if (xp1 > xp2) {
                    arrow = '<span class="comparison-arrow" style="color: #4caf50;">&#x2B06;</span>';
                } else if (xp1 < xp2) {
                    arrow = '<span class="comparison-arrow" style="color: #f44336;">&#x2B07;</span>';
                } else {
                    arrow = '<span class="comparison-arrow" style="color: #ffd600; font-size: 1.7em; font-weight: bold; display: inline-block; line-height: 1;">&#x2014;</span>';
                }
            }
        } else if (!isNaN(xp1) && !isNaN(xp2)) {
            if (xp1 > xp2) {
                rowClass = 'leading-member1';
                arrow = '<span class="comparison-arrow" style="color: #4caf50;">&#x2B06;</span>';
            } else if (xp1 < xp2) {
                rowClass = 'leading-member2';
                arrow = '<span class="comparison-arrow" style="color: #f44336;">&#x2B07;</span>';
            } else {
                rowClass = 'tied-row';
                arrow = '<span class="comparison-arrow" style="color: #ffd600; font-size: 1.7em; font-weight: bold; display: inline-block; line-height: 1;">&#x2014;</span>';
            }
        }
        html += `<tr class="${rowClass}">`;
        html += `<td style="text-align:left;font-weight:bold;color:#e0e0e0;border-right:3px solid #232323;">${skillRow.skill}</td>`;
        html += `<td style="text-align:right;">${skillRow.member1.level}</td>`;
        html += `<td style="text-align:right;border-right:3px solid #232323;">${skillRow.member1.xp}</td>`;
        html += `<td style="text-align:center;border-right:3px solid #232323;">${arrow}</td>`;
        html += `<td style="text-align:right;">${skillRow.member2.level}</td>`;
        html += `<td style="text-align:right;">${skillRow.member2.xp}</td>`;
        html += `<td style="text-align:right;border-left:3px solid #232323;">${diff}</td>`;
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = controlsHtml + html;
    // Restore scroll position after rendering (use requestAnimationFrame for reliability)
    const newScrollDiv = document.getElementById('table-scroll');
    if (newScrollDiv) {
        requestAnimationFrame(() => {
            newScrollDiv.scrollLeft = prevScrollLeft;
        });
    }
    // Re-attach event handler for the checkbox
    const hideZeroCb = document.getElementById('hide-zero-xp');
    if (hideZeroCb) {
        hideZeroCb.onchange = () => {
            hideZeroXpState = hideZeroCb.checked;
            // Always use the current sort state and sorting logic for filtering
            sortAndRender(window.currentSortState);
        };
    }
    // Re-attach sort and swap handlers
    if (typeof attachSortHandlers === 'function') attachSortHandlers();
}

// Helper: get the current view data based on swap state
function getCurrentViewData() {
    const base = window.baseData;
    if (!window.isSwapped) return { ...base, skills: base.skills.map(row => ({ ...row, member1: { ...row.member1 }, member2: { ...row.member2 } })) };
    // Swap member names and all skill/XP data
    return {
        memberNames: [base.memberNames[1], base.memberNames[0]],
        skills: base.skills.map(row => ({
            skill: row.skill,
            member1: { ...row.member2 },
            member2: { ...row.member1 }
        }))
    };
}

function sortAndRender(sortState) {
    const data = getCurrentViewData();
    let skills = data.skills.slice();
    const totalRow = skills.shift();
    if (!sortState || !sortState.member) {
        skills.unshift(totalRow);
        renderComparisonTable(data, sortState);
        return;
    }
    // Helper for member sort (XP or Level)
    function memberSort(primary, secondary, isLevel = false) {
        return (row) => {
            let val = row[primary][isLevel ? 'level' : 'xp'];
            return parseInt((val || '').replace(/,/g, '')) || 0;
        };
    }
    let getValue, secondaryKey, tertiaryKey, isSkillSort = false, isMember1 = false, isMember2 = false, isMember1Level = false, isMember2Level = false;
    switch (sortState.member) {
        case 'skill':
            getValue = row => row.skill.toLowerCase();
            secondaryKey = row => parseInt(row.member1.xp.replace(/,/g, '')) || 0;
            isSkillSort = true;
            break;
        case 'member1':
            getValue = memberSort('member1', 'member2');
            secondaryKey = memberSort('member2', 'member1');
            tertiaryKey = row => row.skill.toLowerCase();
            isMember1 = true;
            break;
        case 'member2':
            getValue = memberSort('member2', 'member1');
            secondaryKey = memberSort('member1', 'member2');
            tertiaryKey = row => row.skill.toLowerCase();
            isMember2 = true;
            break;
        case 'member1-level':
            getValue = memberSort('member1', 'member2', true);
            secondaryKey = memberSort('member2', 'member1', true);
            tertiaryKey = row => row.skill.toLowerCase();
            isMember1Level = true;
            break;
        case 'member2-level':
            getValue = memberSort('member2', 'member1', true);
            secondaryKey = memberSort('member1', 'member2', true);
            tertiaryKey = row => row.skill.toLowerCase();
            isMember2Level = true;
            break;
        case 'xpdiff':
            getValue = row => (parseInt(row.member1.xp.replace(/,/g, '')) || 0) - (parseInt(row.member2.xp.replace(/,/g, '')) || 0);
            secondaryKey = row => row.skill.toLowerCase();
            break;
        default:
            getValue = row => 0;
            secondaryKey = row => row.skill.toLowerCase();
    }
    skills.sort((a, b) => {
        // Always keep total row at the top
        if (a.skill === 'Total') return -1;
        if (b.skill === 'Total') return 1;
        let vA = getValue(a), vB = getValue(b);
        if (vA === vB) {
            if (isSkillSort) {
                // If skill names are equal, tiebreak by XP
                vA = secondaryKey(a);
                vB = secondaryKey(b);
                return vB - vA; // Descending XP for tiebreak
            } else if (isMember1 || isMember2 || isMember1Level || isMember2Level) {
                // Secondary sort by the other member's XP or Level, same direction
                let sA = secondaryKey(a), sB = secondaryKey(b);
                if (sA !== sB) {
                    if (sortState.order === 'asc') return sA - sB;
                    if (sortState.order === 'desc') return sB - sA;
                }
                // Tertiary sort by skill name
                let tA = tertiaryKey(a), tB = tertiaryKey(b);
                return tA.localeCompare(tB);
            } else {
                vA = secondaryKey(a);
                vB = secondaryKey(b);
                return vA.localeCompare(vB);
            }
        }
        if (isSkillSort) {
            // Use localeCompare for skill name
            return sortState.order === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
        } else {
            if (sortState.order === 'asc') return vA - vB;
            if (sortState.order === 'desc') return vB - vA;
            return 0;
        }
    });
    skills.unshift(totalRow);
    renderComparisonTable({ ...data, skills }, sortState);
}

function swapAndRender(sortState) {
    window.isSwapped = !window.isSwapped;
    // If sorting by member1/member2, swap the sortState.member as well
    let newSortState = sortState;
    if (sortState) {
        if (sortState.member === 'member1') newSortState = { ...sortState, member: 'member2' };
        else if (sortState.member === 'member2') newSortState = { ...sortState, member: 'member1' };
        else if (sortState.member === 'member1-level') newSortState = { ...sortState, member: 'member2-level' };
        else if (sortState.member === 'member2-level') newSortState = { ...sortState, member: 'member1-level' };
        else newSortState = { ...sortState };
    }
    window.currentSortState = newSortState;
    sortAndRender(newSortState);
}

function attachSortHandlers() {
    // Get current sort state from the arrows
    let sortState = window.currentSortState || null;
    // Skill
    const skillBtn = document.getElementById('sort-skill');
    if (skillBtn) {
        skillBtn.onclick = () => {
            let order = 'desc';
            if (sortState && sortState.member === 'skill') {
                order = sortState.order === 'desc' ? 'asc' : (sortState.order === 'asc' ? null : 'desc');
            }
            window.currentSortState = order ? { member: 'skill', order } : null;
            sortAndRender(window.currentSortState);
        };
    }
    // Member1 XP
    const m1Btn = document.getElementById('sort-member1');
    if (m1Btn) {
        m1Btn.onclick = () => {
            let order = 'desc';
            if (sortState && sortState.member === 'member1') {
                order = sortState.order === 'desc' ? 'asc' : (sortState.order === 'asc' ? null : 'desc');
            }
            window.currentSortState = order ? { member: 'member1', order } : null;
            sortAndRender(window.currentSortState);
        };
    }
    // Member2 XP
    const m2Btn = document.getElementById('sort-member2');
    if (m2Btn) {
        m2Btn.onclick = () => {
            let order = 'desc';
            if (sortState && sortState.member === 'member2') {
                order = sortState.order === 'desc' ? 'asc' : (sortState.order === 'asc' ? null : 'desc');
            }
            window.currentSortState = order ? { member: 'member2', order } : null;
            sortAndRender(window.currentSortState);
        };
    }
    // Member1 Level
    const m1LvlBtn = document.getElementById('sort-level-member1');
    if (m1LvlBtn) {
        m1LvlBtn.onclick = () => {
            let order = 'desc';
            if (sortState && sortState.member === 'member1-level') {
                order = sortState.order === 'desc' ? 'asc' : (sortState.order === 'asc' ? null : 'desc');
            }
            window.currentSortState = order ? { member: 'member1-level', order } : null;
            sortAndRender(window.currentSortState);
        };
    }
    // Member2 Level
    const m2LvlBtn = document.getElementById('sort-level-member2');
    if (m2LvlBtn) {
        m2LvlBtn.onclick = () => {
            let order = 'desc';
            if (sortState && sortState.member === 'member2-level') {
                order = sortState.order === 'desc' ? 'asc' : (sortState.order === 'asc' ? null : 'desc');
            }
            window.currentSortState = order ? { member: 'member2-level', order } : null;
            sortAndRender(window.currentSortState);
        };
    }
    // XP Diff
    const xpdiffBtn = document.getElementById('sort-xpdiff');
    if (xpdiffBtn) {
        xpdiffBtn.onclick = () => {
            let order = 'desc';
            if (sortState && sortState.member === 'xpdiff') {
                order = sortState.order === 'desc' ? 'asc' : (sortState.order === 'asc' ? null : 'desc');
            }
            window.currentSortState = order ? { member: 'xpdiff', order } : null;
            sortAndRender(window.currentSortState);
        };
    }
    // Swap button
    const swapBtn = document.getElementById('swap-members');
    if (swapBtn) {
        swapBtn.onclick = () => {
            swapAndRender(window.currentSortState);
        };
    }
    // After rendering table, make header cell click also trigger sort
    setTimeout(() => {
        const headerMap = [
            { th: 'sort-skill-th', btn: 'sort-skill' },
            { th: 'sort-level-member1-th', btn: 'sort-level-member1' },
            { th: 'sort-member1-th', btn: 'sort-member1' },
            { th: 'sort-level-member2-th', btn: 'sort-level-member2' },
            { th: 'sort-member2-th', btn: 'sort-member2' },
            { th: 'sort-xpdiff-th', btn: 'sort-xpdiff' }
        ];
        headerMap.forEach(({ th, btn }) => {
            const thElem = document.getElementById(th);
            const btnElem = document.getElementById(btn);
            if (thElem && btnElem) {
                thElem.style.cursor = 'pointer';
                thElem.onclick = e => {
                    // Prevent double trigger if button is clicked
                    if (e.target === btnElem || btnElem.contains(e.target)) return;
                    btnElem.click();
                };
            }
        });
    }, 0);
}

window.addEventListener("DOMContentLoaded", async () => {
    let sortState = null;
    container = document.getElementById("comparison-table-container");
    try {
        const html = await fetchGroupData();
        window.baseData = parseGroupData(html); // immutable base
        window.originalData = window.baseData; // for checkbox handler
        window.isSwapped = false;
        window.currentSortState = null;
        sortAndRender(null);
    } catch (e) {
        container.innerHTML = `<p>Error: ${e.message}</p>`;
        return;
    }
});
