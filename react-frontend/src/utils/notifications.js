let _swReg = null

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  try {
    _swReg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
  } catch (e) {
    console.warn('[BidEval] SW registration failed:', e)
  }
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export async function sendEvalNotification(title, body) {
  // Tab title — always works regardless of notification permission
  const originalTitle = document.title
  document.title = `✅ ${title}`
  document.addEventListener('visibilitychange', function onVisible() {
    if (!document.hidden) {
      document.title = originalTitle
      document.removeEventListener('visibilitychange', onVisible)
    }
  })

  if (!('Notification' in window)) {
    console.warn('[BidEval] Notification API not available')
    return
  }

  if (Notification.permission !== 'granted') {
    console.warn('[BidEval] Notification permission:', Notification.permission)
    return
  }

  const opts = {
    body,
    icon: '/logo.png',
    tag: 'bideval-result',
    requireInteraction: true,
  }

  // Try service worker notification (preferred — survives tab focus changes)
  try {
    const reg = _swReg ?? await navigator.serviceWorker.ready
    await reg.showNotification(title, opts)
    console.log('[BidEval] SW notification sent')
    return
  } catch (e) {
    console.warn('[BidEval] SW notification failed, trying direct:', e)
  }

  // Fallback: direct Notification API
  try {
    new Notification(title, opts)
    console.log('[BidEval] Direct notification sent')
  } catch (e) {
    console.warn('[BidEval] Direct notification failed:', e)
  }
}

// Exposed for the test button in settings
export async function testNotification() {
  console.log('[BidEval] Notification.permission =', Notification.permission)
  console.log('[BidEval] SW registration =', _swReg)

  const granted = await requestNotificationPermission()
  if (!granted) {
    return { ok: false, reason: 'Permission denied or dismissed. Check Edge site settings (lock icon in address bar).' }
  }
  await sendEvalNotification('BidEval — Test', 'Notifications are working correctly!')
  return { ok: true }
}
