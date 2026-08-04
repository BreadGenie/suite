import { io } from 'socket.io-client'

let socketInstance = null

export function initSocket() {
  if (socketInstance) return socketInstance

  let siteName = window.site_name || 'drive.localhost'

  let default_port = __SOCKETIO_PORT__
  let port = window.location.port ? `:${default_port}` : ''
  let protocol = port ? 'http' : 'https'
  let host = window.location.hostname

  let url = `${protocol}://${host}${port}/${siteName}`
  socketInstance = io(url, {
    withCredentials: true,
    reconnectionAttempts: 5,
  })
  socketInstance.on('connect_error', (data) => {
    console.log(data)
  })
  return socketInstance
}

// For non-component code (plain utils) that needs the same connection
// DriveLayout already opened and `provide`d — call after the app has mounted.
export function getSocket() {
  return socketInstance
}
