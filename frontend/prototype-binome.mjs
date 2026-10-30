// PROTOTYPE (#171): `npm run proto` starts the mock and the dev server together, and says where to look.
import { spawn } from "node:child_process"

const run = (cmd) => spawn(cmd, { shell: true, stdio: ["ignore", "ignore", "inherit"] })
const kids = [run("node ../test/webdev.js 3000"), run("npx vite --port 5173 --strictPort")]
const stop = () => { kids.forEach((k) => k.kill()); process.exit() }
process.on("SIGINT", stop)
kids.forEach((k) => k.on("exit", stop))
console.log(`
Starting the mock (about 10 s). Then open, in this order:
  http://localhost:5173/dev-login?as=admin@g.enp.edu.dz     sign in as an admin
  http://localhost:5173/binomes                             click a code in the table: the panel
  http://localhost:5173/binomes/B.01                        the full page
  http://localhost:5173/dev-login?as=adminmember            an admin who is in a binome
Ctrl C stops both.
`)
