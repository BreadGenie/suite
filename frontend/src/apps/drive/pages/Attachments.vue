<template>
  <GenericPage
    :get-entities="getAttachments"
    :empty="{
      icon: LucidePaperclip,
      title: 'No attachments yet',
      description: 'Files attached to documents will show up here.',
    }"
  />
</template>

<script setup>
import GenericPage from '@/apps/drive/components/GenericPage.vue'
import { getAttachments } from '@/apps/drive/resources/files'
import LucidePaperclip from '~icons/lucide/paperclip'
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { setPageBreadcrumbs } from '@/apps/drive/data/breadcrumbs'

const props = defineProps({
  doctype: {
    type: String,
    required: false,
  },
  docname: {
    type: String,
    required: false,
  },
})
const route = useRoute()

watch(
  () => [props.doctype, props.docname],
  ([doctype, docname]) => {
    getAttachments.params = {
      ...getAttachments.params,
      doctype,
      docname,
    }
    setPageBreadcrumbs(
      [
        {
          label: __(route.name.replace('drive-', '')),
          name: route.name,
          route: { name: route.name },
        },
        {
          label: doctype,
          name: doctype,
          route: { name: route.name, params: { doctype } },
        },
        {
          label: docname,
          name: docname,
          route: { name: route.name, params: { doctype, docname } },
        },
      ].filter((k) => k.label),
    )
  },
  { immediate: true }
)
</script>
