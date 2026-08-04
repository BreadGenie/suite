import { computed } from 'vue'
import { useRoute } from 'vue-router'

// Grid tracks shared by the list view and its loading skeleton, so the
// placeholder rows land exactly where the real ones will.
export function useListColumns() {
  const route = useRoute()
  return computed(() => [
    '16px',
    'minmax(0,1fr)',
    '10%',
    '15%',
    route.name === 'drive-Attachments' ? '25%' : '8%',
    '5%',
  ])
}
