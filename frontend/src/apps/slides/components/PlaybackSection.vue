<template>
	<Section label="Playback">
		<PropertyRow label="Autoplay">
			<Switch :modelValue="activeElement.autoplay" @update:modelValue="setAutoplay" />
		</PropertyRow>
		<PropertyRow label="Loop">
			<Switch :modelValue="activeElement.loop" @update:modelValue="setLoop" />
		</PropertyRow>
		<NumberControl
			:modelValue="activeElement.playbackRate ?? 1"
			label="Speed"
			suffix="x"
			:min="0.5"
			:max="2"
			:max-digits="3"
			:step="0.1"
			@update:modelValue="playbackRate.set"
			@change-start="playbackRate.begin"
			@change-end="playbackRate.commit"
		/>
	</Section>
</template>

<script setup>
import { Switch } from 'frappe-ui'

import PropertyRow from '@/apps/slides/components/controls/PropertyRow.vue'
import NumberControl from '@/apps/slides/components/controls/NumberControl.vue'
import Section from '@/apps/slides/components/controls/Section.vue'

import { activeElement } from '@/apps/slides/stores/element'
import {
	setElementProperty,
	useElementProperty,
} from '@/apps/slides/composables/editProperty'

const setAutoplay = (value) => setElementProperty('autoplay', value)
const setLoop = (value) => setElementProperty('loop', value)

const playbackRate = useElementProperty('playbackRate')
</script>
