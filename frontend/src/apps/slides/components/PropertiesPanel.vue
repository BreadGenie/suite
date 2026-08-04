<template>
	<div
		class="no-scrollbar flex h-full w-72 flex-col overflow-y-auto border-l bg-surface-base px-4"
		@mousedown="keepEditorFocus"
	>
		<div v-if="activeElementIds.length">
			<PositionSection />
			<Divider flexItem />
			<LayoutSection />
			<template v-if="activeElement?.type === 'text' || isEditingShapeText">
				<Divider flexItem />
				<TypographySection />
			</template>
			<template v-if="activeElement?.type === 'shape' && !isEditingShapeText">
				<Divider flexItem />
				<ShapeStyleSection />
			</template>
			<template v-if="activeElement?.type === 'video'">
				<Divider flexItem />
				<PlaybackSection />
			</template>
			<template v-if="['image', 'video'].includes(activeElement?.type)">
				<Divider flexItem />
				<BorderSection :key="activeElement?.id" />
			</template>
			<template v-if="['image', 'video', 'shape'].includes(activeElement?.type)">
				<Divider flexItem />
				<ShadowSection :key="activeElement?.id" />
			</template>
			<template v-if="activeElement">
				<Divider flexItem />
				<AppearanceSection />
			</template>
		</div>
		<div v-else-if="currentSlide">
			<BackgroundSection />
			<Divider flexItem />
			<TransitionSection />
		</div>
	</div>
</template>

<script setup>
import { computed } from 'vue'

import { activeElement, activeElementIds, focusElementId } from '@/apps/slides/stores/element'
import { currentSlide } from '@/apps/slides/stores/slide'

import { Divider } from 'frappe-ui'

import PositionSection from './PositionSection.vue'
import LayoutSection from './LayoutSection.vue'
import AppearanceSection from './AppearanceSection.vue'
import TypographySection from './TypographySection.vue'
import ShapeStyleSection from './ShapeStyleSection.vue'
import PlaybackSection from './PlaybackSection.vue'
import BorderSection from './BorderSection.vue'
import ShadowSection from './ShadowSection.vue'
import BackgroundSection from './BackgroundSection.vue'
import TransitionSection from './TransitionSection.vue'

const isEditingShapeText = computed(
	() => activeElement.value?.type === 'shape' && focusElementId.value === activeElement.value?.id,
)

const keepEditorFocus = (e) => {
	if (e.target.closest('input, textarea')) return
	e.preventDefault()
}
</script>
