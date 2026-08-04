<template>
	<Section label="Style">
		<PropertyRow label="Stroke Style">
			<LineStyleSelect
				:modelValue="displayStrokeStyle"
				:options="strokeStyleOptions"
				@update:modelValue="setStrokeStyle"
			/>
		</PropertyRow>
		<NumberControl
			:modelValue="activeElement.strokeWidth ?? 0"
			label="Stroke Width"
			suffix="px"
			:min="strokeMin"
			:max="50"
			:max-digits="3"
			:step="0.5"
			@update:modelValue="strokeWidth.set"
			@change-start="strokeWidth.begin"
			@change-end="strokeWidth.commit"
		/>
		<PropertyRow label="Stroke Color">
			<ColorPicker
				:modelValue="activeElement.strokeColor"
				@update:modelValue="strokeColor.set"
				@colordown="strokeColor.begin"
				@colorup="strokeColor.commit"
			/>
		</PropertyRow>
		<PropertyRow v-if="activeElement.shapeType != 'line'" label="Fill Color">
			<ColorPicker
				:modelValue="activeElement.fillColor"
				@update:modelValue="fillColor.set"
				@colordown="fillColor.begin"
				@colorup="fillColor.commit"
			/>
		</PropertyRow>
		<NumberControl
			v-if="activeElement.shapeType == 'rectangle'"
			:modelValue="activeElement.borderRadius ?? 0"
			label="Corner Radius"
			suffix="px"
			:min="0"
			:max="MAX_BORDER_RADIUS"
			:max-digits="3"
			:step="0.5"
			@update:modelValue="borderRadius.set"
			@change-start="borderRadius.begin"
			@change-end="borderRadius.commit"
		/>
		<PropertyRow v-if="activeElement.shapeType == 'line'" label="Arrows">
			<Select
				:modelValue="arrowDirection"
				variant="ghost"
				:options="arrowOptions"
				class="-me-1"
				@update:modelValue="setArrowDirection"
			>
				<template #trigger="{ selectedOption }">
					<span :class="valueClasses">{{ selectedOption?.label }}</span>
					<span :class="chevronClasses" />
				</template>
			</Select>
		</PropertyRow>
	</Section>
</template>

<script setup>
import { computed } from 'vue'

import { Select } from 'frappe-ui'

import ColorPicker from '@/apps/slides/components/controls/ColorPicker.vue'
import PropertyRow from '@/apps/slides/components/controls/PropertyRow.vue'
import NumberControl from '@/apps/slides/components/controls/NumberControl.vue'
import Section from '@/apps/slides/components/controls/Section.vue'
import LineStyleSelect from '@/apps/slides/components/controls/LineStyleSelect.vue'
import { chevronClasses, MAX_BORDER_RADIUS } from '@/apps/slides/utils/constants'

import { activeElement } from '@/apps/slides/stores/element'
import {
	setElementProperty,
	useElementProperty,
} from '@/apps/slides/composables/editProperty'

const arrowOptions = [
	{ label: 'None', value: 'none' },
	{ label: 'Left', value: 'left' },
	{ label: 'Right', value: 'right' },
	{ label: 'Both', value: 'both' },
]

const arrowDirection = computed(() => {
	const el = activeElement.value
	if (el.markerStart && el.markerEnd) return 'both'
	if (el.markerStart) return 'left'
	if (el.markerEnd) return 'right'
	return 'none'
})

const setArrowDirection = (value) => {
	setElementProperty('markerStart', value === 'left' || value === 'both')
	setElementProperty('markerEnd', value === 'right' || value === 'both')
}

const strokeStyleOptions = [
	{ label: 'Solid', value: 'solid' },
	{ label: 'Dashed', value: 'dashed' },
	{ label: 'Dotted', value: 'dotted' },
]

const displayStrokeStyle = computed(() => activeElement.value.strokeStyle || 'solid')

const setStrokeStyle = (value) => setElementProperty('strokeStyle', value)

const strokeMin = computed(() => (activeElement.value.shapeType === 'line' ? 0.5 : 0))

const borderRadius = useElementProperty('borderRadius')
const strokeWidth = useElementProperty('strokeWidth')
const fillColor = useElementProperty('fillColor')
const strokeColor = useElementProperty('strokeColor')

const valueClasses = 'block w-16 font-text text-base text-ink-gray-8'
</script>
