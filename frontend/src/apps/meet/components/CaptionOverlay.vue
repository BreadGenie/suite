<template>
	<Transition
		enter-active-class="transition-all duration-300 ease-out"
		enter-from-class="opacity-0 translate-y-2"
		enter-to-class="opacity-100 translate-y-0"
		leave-active-class="transition-all duration-200 ease-in"
		leave-from-class="opacity-100 translate-y-0"
		leave-to-class="opacity-0 translate-y-2"
	>
		<div
			v-show="isCaptionsEnabled && lines.length > 0"
			class="pointer-events-none z-[40] flex shrink-0 justify-center px-2 pb-2 pt-1"
		>
			<div class="flex w-full max-w-[min(90vw,56rem)] flex-col items-center gap-1">
				<div
					v-for="line in visibleLines"
					:key="line.id"
					:class="[
						'flex max-w-full items-start gap-2 rounded-md px-2.5 py-1 text-left text-sm font-medium leading-snug text-white shadow-lg sm:text-base',
						{ 'opacity-60 italic': line.text === '...' },
					]"
					style="
						background-color: rgba(0, 0, 0, 0.65);
						text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
						overflow-wrap: anywhere;
					"
				>
					<Avatar
						size="sm"
						:image="line.avatar"
						:label="line.participantName"
						class="mt-0.5 shrink-0 ring-1 ring-white/20"
					/>
					<div class="min-w-0">
						<div class="text-xs font-semibold leading-tight text-white/75">
							{{ line.participantName }}
						</div>
						<div>{{ line.text }}</div>
					</div>
				</div>
			</div>
		</div>
	</Transition>
</template>

<script setup>
import { Avatar } from "frappe-ui";
import { computed } from "vue";

const props = defineProps({
	isCaptionsEnabled: Boolean,
	lines: {
		type: Array,
		default: () => [],
	},
	participants: {
		type: Object,
		default: () => ({}),
	},
	currentUser: {
		type: Object,
		default: null,
	},
});

const getParticipant = (participantId) => {
	if (props.currentUser?.user_id === participantId) {
		return {
			name: props.currentUser.full_name || props.currentUser.name || "You",
			avatar: props.currentUser.avatar || "",
		};
	}

	const participant = props.participants?.[participantId];
	return {
		name: participant?.user_name || participant?.full_name || participantId,
		avatar: participant?.avatar || "",
	};
};

const visibleLines = computed(() =>
	props.lines.slice(-2).map((line) => {
		const participant = getParticipant(line.participantId);
		return {
			...line,
			participantName: participant.name || line.participantName,
			avatar: participant.avatar,
		};
	}),
);
</script>
