<template>
	<Section label="Layout">
		<template v-if="!isMultiSelect">
			<NumberControl
				v-for="field in sizeFields"
				:key="field.property"
				:modelValue="Math.round(selectionBounds[field.property])"
				:label="field.label"
				suffix="px"
				:min="1"
				:max-digits="4"
				:step="1"
				:disabled="field.property == 'height' && !canEditHeight"
				@update:modelValue="(value) => sizeScrub.preview(field.property, value)"
				@change-start="sizeScrub.begin"
				@change-end="sizeScrub.commit"
			/>
		</template>
		<NumberControl
			v-if="canRotate"
			:modelValue="rotationValue"
			label="Rotate"
			suffix="°"
			:max-digits="3"
			:step="1"
			@update:modelValue="previewRotate"
			@change-start="beginRotateChange"
			@change-end="commitRotateChange"
		/>
		<ButtonGroup label="Flip" :options="flipOptions" @select="flipElements" />
	</Section>
</template>

<script setup>
import { computed } from 'vue'

import NumberControl from '@/apps/slides/components/controls/NumberControl.vue'
import ButtonGroup from '@/apps/slides/components/controls/ButtonGroup.vue'
import Section from '@/apps/slides/components/controls/Section.vue'

import FlipHorizontal from '@/apps/slides/icons/FlipHorizontal.vue'
import FlipVertical from '@/apps/slides/icons/FlipVertical.vue'

import {
	activeElement,
	activeElementIds,
	addFixedWidthToElement,
	flipElements,
} from '@/apps/slides/stores/element'
import { selectionBounds } from '@/apps/slides/stores/slide'
import { commitInteraction } from '@/apps/slides/stores/interaction'
import { rotationDelta } from '@/apps/slides/stores/interaction'
import { normalizeRotation } from '@/apps/slides/utils/helpers'
import { useInteractionScrub } from '@/apps/slides/composables/useInteractionScrub'

const isMultiSelect = computed(() => activeElementIds.value?.length > 1)

const canEditHeight = computed(() => {
	if (isMultiSelect.value) return false
	if (activeElement.value?.type != 'shape') return false
	return activeElement.value?.shapeType != 'line'
})

const canRotate = computed(() => {
	if (activeElementIds.value?.length > 1) return false
	return ['shape', 'image'].includes(activeElement.value?.type)
})

const rotationValue = computed(() => {
	const deg = (activeElement.value?.rotation || 0) + rotationDelta.value
	return Math.round(normalizeRotation(deg))
})

const sizeScrub = useInteractionScrub(['width', 'height'], () => {
	if (!activeElement.value.width) addFixedWidthToElement()
})

let rotateStartAngle = null

const beginRotateChange = () => {
	if (rotateStartAngle != null) return
	rotateStartAngle = activeElement.value?.rotation || 0
}

const previewRotate = (value) => {
	if (rotateStartAngle == null) return
	rotationDelta.value = value - rotateStartAngle
}

const commitRotateChange = () => {
	if (rotateStartAngle == null) return
	rotateStartAngle = null
	commitInteraction()
}

const sizeFields = [
	{ property: 'width', label: 'Width' },
	{ property: 'height', label: 'Height' },
]

const flipOptions = [
	{ value: 'horizontal', label: 'Flip horizontal', icon: FlipHorizontal },
	{ value: 'vertical', label: 'Flip vertical', icon: FlipVertical },
]
</script>
