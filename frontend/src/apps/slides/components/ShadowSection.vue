<template>
	<Section label="Shadow" :initialState="hasShadow">
		<PropertyRow label="Color">
			<ColorPicker
				:modelValue="activeElement.shadowColor ?? defaultShadowColor"
				@update:modelValue="shadowColor.set"
				@colordown="shadowColor.begin"
				@colorup="shadowColor.commit"
			/>
		</PropertyRow>
		<NumberControl
			:modelValue="activeElement.shadowBlur ?? 0"
			label="Blur"
			suffix="%"
			:min="0"
			:max="100"
			:max-digits="3"
			:step="1"
			@update:modelValue="shadowBlur.set"
			@change-start="shadowBlur.begin"
			@change-end="shadowBlur.commit"
		/>
		<NumberControl
			:modelValue="activeElement.shadowOpacity ?? 100"
			label="Opacity"
			suffix="%"
			:min="0"
			:max="100"
			:max-digits="3"
			:step="1"
			@update:modelValue="shadowOpacity.set"
			@change-start="shadowOpacity.begin"
			@change-end="shadowOpacity.commit"
		/>
		<NumberControl
			:modelValue="activeElement.shadowOffset ?? 0"
			label="Offset"
			suffix="%"
			:min="0"
			:max="100"
			:max-digits="3"
			:step="1"
			@update:modelValue="shadowOffset.set"
			@change-start="shadowOffset.begin"
			@change-end="shadowOffset.commit"
		/>
		<NumberControl
			:modelValue="activeElement.shadowAngle ?? 45"
			label="Angle"
			suffix="°"
			:min="0"
			:max="360"
			:max-digits="3"
			:step="1"
			@update:modelValue="shadowAngle.set"
			@change-start="shadowAngle.begin"
			@change-end="shadowAngle.commit"
		/>
	</Section>
</template>

<script setup>
import { computed } from 'vue'

import ColorPicker from '@/apps/slides/components/controls/ColorPicker.vue'
import PropertyRow from '@/apps/slides/components/controls/PropertyRow.vue'
import NumberControl from '@/apps/slides/components/controls/NumberControl.vue'
import Section from '@/apps/slides/components/controls/Section.vue'

import { activeElement } from '@/apps/slides/stores/element'
import { useElementProperty } from '@/apps/slides/composables/editProperty'
import { defaultShadowColor } from '@/apps/slides/utils/constants'

const hasShadow = computed(() =>
	Boolean(activeElement.value.shadowBlur || activeElement.value.shadowOffset),
)

const shadowColor = useElementProperty('shadowColor')
const shadowOpacity = useElementProperty('shadowOpacity')
const shadowBlur = useElementProperty('shadowBlur')
const shadowOffset = useElementProperty('shadowOffset')
const shadowAngle = useElementProperty('shadowAngle')
</script>
