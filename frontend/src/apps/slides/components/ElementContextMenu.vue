<template>
	<ContextMenu :options="contextMenuOptions">
		<div>
			<slot />
		</div>
	</ContextMenu>
</template>

<script setup>
import { ref, inject } from 'vue'
import { ContextMenu } from 'frappe-ui'

import {
	activeElements,
	focusElementId,
	setActiveElements,
	duplicateElements,
	deleteElements,
	flipElements,
} from '@/apps/slides/stores/element'

import { alignElement, arrangeElements } from '@/apps/slides/stores/placement'
import { inCropMode, startCrop } from '@/apps/slides/stores/imageCrop'
import { currentSlide } from '@/apps/slides/stores/slide'

import BringToFront from '@/apps/slides/icons/BringToFront.vue'
import SendToBack from '@/apps/slides/icons/SendToBack.vue'
import Forward from '@/apps/slides/icons/Forward.vue'
import Backward from '@/apps/slides/icons/Backward.vue'
import AlignLeft from '@/apps/slides/icons/AlignLeft.vue'
import AlignCenter from '@/apps/slides/icons/AlignCenter.vue'
import AlignRight from '@/apps/slides/icons/AlignRight.vue'
import AlignTop from '@/apps/slides/icons/AlignTop.vue'
import AlignCenterVertical from '@/apps/slides/icons/AlignCenterVertical.vue'
import AlignBottom from '@/apps/slides/icons/AlignBottom.vue'
import FlipHorizontal from '@/apps/slides/icons/FlipHorizontal.vue'
import FlipVertical from '@/apps/slides/icons/FlipVertical.vue'

const inReadonlyMode = inject('inReadonlyMode', ref(false))

const contextMenuOptions = ref([])

// the underlying trigger opens the menu unless the event is defaultPrevented, so
// we open it only for right-clicks that land on an element or the selection box
const handleContextMenu = (e) => {
	if (e.target?.isContentEditable) return e.stopPropagation()

	if (inReadonlyMode.value || inCropMode.value) return e.preventDefault()

	const elementNode = e.target?.closest?.('[data-index]')
	if (elementNode) {
		const element = currentSlide.value?.elements.find(
			(el) => String(el.id) === elementNode.dataset.index,
		)
		if (!element || focusElementId.value == element.id) return e.preventDefault()
		setActiveElements([element.id])
	} else if (!e.target?.closest?.('[data-selection-box]')) {
		return e.preventDefault()
	}

	contextMenuOptions.value = buildElementContextOptions()
}

const buildElementContextOptions = () => {
	const canFlip = activeElements.value.every((el) => ['shape', 'image'].includes(el.type))

	const orderOptions = [
		{ label: 'Bring to front', icon: BringToFront, onClick: () => arrangeElements('front') },
		{ label: 'Bring forward', icon: Forward, onClick: () => arrangeElements('forward') },
		{ label: 'Send backward', icon: Backward, onClick: () => arrangeElements('backward') },
		{ label: 'Send to back', icon: SendToBack, onClick: () => arrangeElements('back') },
	]

	const alignOptions = [
		{ label: 'Left', icon: AlignLeft, onClick: () => alignElement('left') },
		{ label: 'Center', icon: AlignCenter, onClick: () => alignElement('horizontalCenter') },
		{ label: 'Right', icon: AlignRight, onClick: () => alignElement('right') },
		{ label: 'Top', icon: AlignTop, onClick: () => alignElement('top') },
		{ label: 'Middle', icon: AlignCenterVertical, onClick: () => alignElement('verticalCenter') },
		{ label: 'Bottom', icon: AlignBottom, onClick: () => alignElement('bottom') },
	]

	const arrangeOptions = [
		{ label: 'Order', icon: BringToFront, submenu: orderOptions },
		{ label: 'Align', icon: AlignLeft, submenu: alignOptions },
	]

	if (canFlip) {
		arrangeOptions.push(
			{ label: 'Flip horizontal', icon: FlipHorizontal, onClick: () => flipElements('horizontal') },
			{ label: 'Flip vertical', icon: FlipVertical, onClick: () => flipElements('vertical') },
		)
	}

	const clipboardOptions = [
		{ label: 'Copy', icon: 'lucide-copy', onClick: () => document.execCommand('copy') },
		{
			label: 'Duplicate',
			icon: 'lucide-copy-plus',
			onClick: () => duplicateElements(null, activeElements.value),
		},
	]

	const canCrop = activeElements.value.length == 1 && activeElements.value[0].type == 'image'
	if (canCrop) {
		clipboardOptions.push({
			label: 'Crop',
			icon: 'lucide-crop',
			onClick: () => startCrop(activeElements.value[0]),
		})
	}

	const deleteOptions = [
		{ label: 'Delete', icon: 'lucide-trash-2', theme: 'red', onClick: () => deleteElements() },
	]

	return [
		{ group: '', options: clipboardOptions },
		{ group: '', options: arrangeOptions },
		{ group: '', options: deleteOptions },
	]
}

defineExpose({ handleContextMenu })
</script>
