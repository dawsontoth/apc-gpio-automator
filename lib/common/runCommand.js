import { exec } from 'child_process';

export function runCommand(cmd) {
    return new Promise((resolve) => {
        console.log(`Executing command: ${cmd}`);
        exec(cmd, (error, stdout, stderr) => {
            if (error) console.error(`Error executing command: ${error.message}`);
            if (stdout && stdout.trim()) console.log(`stdout: ${stdout.trim()}`);
            if (stderr && stderr.trim()) console.error(`stderr: ${stderr.trim()}`);
            resolve();
        });
    });
}
