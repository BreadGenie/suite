<template>
  <FrappeUIProvider>
    <router-view v-slot="{ Component }">
      <keep-alive :max="5">
        <component :is="Component" />
      </keep-alive>
    </router-view>
  </FrappeUIProvider>
</template>

<script setup>
import { h, onMounted, onUnmounted, provide, ref } from 'vue'
import { toast, FrappeUIProvider } from 'frappe-ui'
import { Wifi, WifiOff } from 'lucide-vue-next'
import { saveCurrentState } from '@/apps/slides/stores/saving'

const isOnline = ref(navigator?.onLine ?? true)

const handleOffline = () => {
  isOnline.value = false
  toast('Lost internet connection.', {
    icon: () => h(WifiOff, { class: 'size-4' }),
  })
}

const handleOnline = () => {
  isOnline.value = true
  saveCurrentState()
  toast('You are back online.', {
    icon: () => h(Wifi, { class: 'size-4' }),
  })
}

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  navigator.serviceWorker.register('/service-worker.js').catch((err) => {
    console.warn('Slides Service Worker registration failed:', err)
  })
}

onMounted(() => {
  isOnline.value = navigator?.onLine
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  registerServiceWorker()
})

onUnmounted(() => {
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
})

provide('isOnline', isOnline)
</script>
