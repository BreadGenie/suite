<template>
	<div v-if="activeElementIds.length && !inCropMode" data-selection-box :style="boxStyles">
		<SelectionControls
			v-if="showControls"
			:elementType="activeElement?.shapeType || activeElement?.type"
			:dimensions="selectionBounds"
			:style="{ pointerEvents: 'auto' }"
		/>
	</div>
</template>
<script setup>
import { computed } from 'vue'

import SelectionControls from '@/apps/slides/components/SelectionControls.vue'

import { slideBounds, selectionBounds } from '@/apps/slides/stores/slide'
import { interactionOffset } from '@/apps/slides/stores/interaction'
import { inCropMode } from '@/apps/slides/stores/imageCrop'
import { rotationDelta } from '@/apps/slides/stores/interaction'
import {
	activeElementIds,
	focusElementId,
	activeElement,
	cropSelectionToFitContent,
} from '@/apps/slides/stores/element'
import { selectionColor } from '@/apps/slides/utils/constants'

const props = defineProps({
	isDragging: {
		type: Boolean,
		default: false,
	},
})

const showControls = computed(() => {
	return activeElementIds.value.length == 1 && !focusElementId.value && !props.isDragging
})

const outline = computed(() => {
	if (activeElement.value?.shapeType == 'line') return 'none'

	if (activeElementIds.value.length == 1) return `${selectionColor} solid ${2 / slideBounds.scale}px`
	return 'none'
})

const isRotatable = computed(() => {
	return ['shape', 'image'].includes(activeElement.value?.type)
})

const selectionRotation = computed(() => {
	if (activeElementIds.value.length != 1 || !isRotatable.value) return 0
	return (activeElement.value.rotation || 0) + rotationDelta.value
})

const boxStyles = computed(() => {
	const offsetLeft = interactionOffset.left
	const offsetTop = interactionOffset.top

	// selectionBounds track the live position; rendering subtracts the
	// transient offset and reapplies it as a transform so moving the box
	// never triggers layout (matches SlideElement)
	const offsetTransform =
		offsetLeft || offsetTop ? `translate(${offsetLeft}px, ${offsetTop}px)` : ''
	const rotateTransform = selectionRotation.value ? `rotate(${selectionRotation.value}deg)` : ''

	return {
		position: 'absolute',
		backgroundColor: activeElementIds.value.length == 1 ? '' : `${selectionColor}25`,
		outline: outline.value,
		width: `${selectionBounds.width}px`,
		height: `${selectionBounds.height}px`,
		left: `${selectionBounds.left - offsetLeft}px`,
		top: `${selectionBounds.top - offsetTop}px`,
		boxSizing: 'border-box',
		zIndex: 9999,
		pointerEvents: activeElementIds.value.length == 1 ? 'none' : 'auto',
		transform: [offsetTransform, rotateTransform].filter(Boolean).join(' '),
		transformOrigin: 'center center',
	}
})

const handleSelectionChange = (elementIds) => {
	if (!elementIds.length) return
	cropSelectionToFitContent(elementIds)
}

defineExpose({
	handleSelectionChange,
})
</script>
