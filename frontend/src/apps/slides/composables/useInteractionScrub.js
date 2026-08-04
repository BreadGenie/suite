import { selectionBounds } from '@/apps/slides/stores/slide'
import { interactionOffset, commitInteraction } from '@/apps/slides/stores/interaction'

export const useInteractionScrub = (properties, onBegin) => {
	let startBounds = null

	const begin = () => {
		if (startBounds) return
		onBegin?.()
		startBounds = {}
		for (const property of properties) startBounds[property] = selectionBounds[property]
	}

	const preview = (property, value) => {
		selectionBounds[property] = value
		if (startBounds) interactionOffset[property] = value - startBounds[property]
	}

	const commit = () => {
		if (!startBounds) return
		startBounds = null
		commitInteraction()
	}

	return { begin, preview, commit }
}
