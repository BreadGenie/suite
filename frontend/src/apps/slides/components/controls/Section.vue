<template>
	<div class="flex flex-col gap-3 py-3">
		<div class="flex cursor-pointer items-center justify-between" @click="toggleContent">
			<span :class="labelClasses">{{ label }}</span>
			<lucide-chevron-down
				class="size-4 stroke-[1.5] text-ink-gray-7 transition-transform duration-200"
				:class="{ '-rotate-90': !showContent }"
			/>
		</div>

		<div v-if="showContent" class="flex flex-col gap-2">
			<slot />
		</div>
	</div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
	label: String,
	initialState: {
		type: Boolean,
		default: true,
	},
})

const showContent = ref(props.initialState)

const toggleContent = () => {
	showContent.value = !showContent.value
}

const labelClasses = 'select-none align-middle font-text text-base font-medium text-ink-gray-7'
</script>
