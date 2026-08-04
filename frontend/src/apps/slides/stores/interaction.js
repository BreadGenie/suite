import { reactive, ref } from 'vue'

import { currentSlide } from './slide'
import { activeElements, activeElementIds } from './element'
import { editElementCommand, batchCommand } from './commands'
import { commandHistory } from './historyMeta'
import { normalizeRotation } from '@/apps/slides/utils/helpers'

const interactionOffset = reactive({ left: 0, top: 0, width: 0, height: 0 })

const rotationDelta = ref(0)

const commitInteraction = () => {
	const commands = []

	activeElements.value.forEach((element) => {
		const addCommand = (property, oldValue, newValue) => {
			if (newValue == oldValue) return
			commands.push(
				editElementCommand({
					slideId: currentSlide.value.clientId,
					elementIds: [element.id],
					property,
					oldValue,
					newValue,
				}),
			)
		}

		;['left', 'top', 'width', 'height'].forEach((key) => {
			if (interactionOffset[key]) addCommand(key, element[key], element[key] + interactionOffset[key])
		})

		if (rotationDelta.value && ['shape', 'image'].includes(element.type)) {
			const rotation = element.rotation || 0
			addCommand('rotation', rotation, normalizeRotation(rotation + rotationDelta.value))
		}
	})

	if (commands.length) {
		commandHistory.execute(
			batchCommand({
				slideId: currentSlide.value.clientId,
				elementIds: activeElementIds.value,
				commands,
				skipJumpOnExecute: true,
			}),
		)
	}

	interactionOffset.left = 0
	interactionOffset.top = 0
	interactionOffset.width = 0
	interactionOffset.height = 0
	rotationDelta.value = 0
}

export { interactionOffset, rotationDelta, commitInteraction }
