import { state } from './state.js';
import { triggerGroup } from './triggerGroup.js';

let lastRunMinute = -1;

/**
 * @returns {void}
 */
export function runSchedules() {
    const config = state.config;
    if (!config || !config.schedules) return;

    const now = new Date();
    const currentMinute = now.getMinutes();
    const currentHour = now.getHours();
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'short' }); // "Sun", "Mon", etc.
    
    // Ensure we only run once per minute
    if (currentMinute === lastRunMinute) return;
    lastRunMinute = currentMinute;

    const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

    for (const schedule of config.schedules) {
        if (schedule.time === currentTime) {
            // Check day if specified
            if (schedule.days && schedule.days.length > 0 && !schedule.days.includes(currentDay)) {
                continue;
            }

            console.log(`Running scheduled task: ${schedule.action} for ${schedule.groups || 'all groups'} at ${schedule.time}`);
            
            if (schedule.groups && schedule.groups.length > 0) {
                for (const group of schedule.groups) {
                    void triggerGroup(group, schedule.action);
                }
            } else {
                void triggerGroup(null, schedule.action);
            }
        }
    }
}
