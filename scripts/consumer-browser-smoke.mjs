// Compatibility command. Install playwright==1.57.0 in an isolated Python environment.
import { execFileSync } from 'node:child_process';
execFileSync(process.env.PYTHON ?? 'python3', ['scripts/consumer_browser_smoke.py'], { stdio: 'inherit' });
