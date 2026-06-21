import { exec, spawn } from 'node:child_process'
import http from 'node:http'

const PORT = 8888
const URL = `http://localhost:${PORT}/`
const STARTUP_TIMEOUT_MS = 120_000

function runCommand(command) {
  return new Promise((resolve) => {
    exec(command, { windowsHide: true }, (error) => {
      resolve(!error)
    })
  })
}

async function openBrowser(url) {
  if (process.platform === 'win32') {
    const attempts = [
      `cmd /c start "" chrome --new-window "${url}"`,
      `cmd /c start "" msedge --new-window "${url}"`,
      `powershell -NoProfile -Command "Start-Process '${url}'"`,
      `cmd /c start "" "${url}"`,
    ]

    for (const command of attempts) {
      const opened = await runCommand(command)
      if (opened) {
        return
      }
    }

    return
  }

  if (process.platform === 'darwin') {
    await runCommand(`open -na "Google Chrome" --args --new-window "${url}"`)
    await runCommand(`open "${url}"`)
    return
  }

  await runCommand(`xdg-open "${url}"`)
}

function printLaunchBanner(url) {
  const line = '='.repeat(52)

  console.log('')
  console.log(line)
  console.log('  Graph Interpretation Tool (Live)')
  console.log('')
  console.log(`  ${url}`)
  console.log('')
  console.log('  새 브라우저 창이 자동으로 열립니다.')
  console.log('  열리지 않으면 위 주소를 클릭하거나 복사해 주세요.')
  console.log(line)
  console.log('')
  console.log(`\x1b]8;;${url}\x1b\\${url}\x1b]8;;\x1b\\`)
  console.log('')
}

function waitForServer(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()

    const check = () => {
      const request = http.get(`http://127.0.0.1:${port}/`, (response) => {
        response.resume()
        resolve()
      })

      request.setTimeout(2_000, () => {
        request.destroy()
      })

      request.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`개발 서버가 ${timeoutMs / 1000}초 안에 시작되지 않았습니다.`))
          return
        }

        setTimeout(check, 500)
      })
    }

    check()
  })
}

function isServerRunning(port) {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${port}/`, (response) => {
      response.resume()
      resolve(true)
    })

    request.setTimeout(2_000, () => {
      request.destroy()
      resolve(false)
    })

    request.on('error', () => {
      resolve(false)
    })
  })
}

let browserOpened = false

async function launchBrowserOnce() {
  if (browserOpened) return

  browserOpened = true
  printLaunchBanner(URL)
  await openBrowser(URL)
}

const alreadyRunning = await isServerRunning(PORT)

if (alreadyRunning) {
  console.log('[dev:live] 포트 8888에서 서버가 이미 실행 중입니다.')
  console.log('[dev:live] 새 브라우저 창을 엽니다.\n')
  await launchBrowserOnce()
  console.log('[dev:live] 새로 시작하려면 기존 터미널의 서버를 종료한 뒤 다시 실행해 주세요.\n')
  process.exit(0)
}

const child = spawn('npx netlify dev --no-open', {
  stdio: 'inherit',
  shell: true,
  env: process.env,
})

waitForServer(PORT, STARTUP_TIMEOUT_MS)
  .then(async () => {
    await launchBrowserOnce()
  })
  .catch((error) => {
    console.error(`\n[dev:live] ${error.message}`)
    console.error(`[dev:live] 포트 ${PORT}이(가) 사용 중이면 기존 서버를 종료한 뒤 다시 실행해 주세요.\n`)
  })

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

process.on('SIGINT', () => {
  child.kill('SIGINT')
})

process.on('SIGTERM', () => {
  child.kill('SIGTERM')
})
