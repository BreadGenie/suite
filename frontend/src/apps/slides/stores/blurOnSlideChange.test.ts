import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

vi.mock('@/apps/slides/utils/mediaUploads', () => ({ getAttachmentUrl: () => '' }))
vi.mock('@/apps/slides/router', () => ({ router: { replace: () => Promise.resolve() } }))

const editorState = vi.hoisted(() => ({ text: '', html: '<p></p>' }))

vi.mock('@/apps/slides/composables/useTextEditor', async () => {
	const { ref } = await import('vue')
	const activeEditor = ref<any>(null)
	const editor = {
		setEditable: () => {},
		isFocused: false,
		commands: { blur: () => {}, focus: () => {}, setTextSelection: () => {} },
		getText: () => editorState.text,
		getHTML: () => editorState.html,
		destroy: () => {},
	}
	return {
		useTextEditor: () => ({
			initTextEditor: () => {
				activeEditor.value = editor
			},
			activeEditor,
		}),
	}
})

const { activeElementIds, focusElementId } = await import('./element')
const { slides, slideIndex, changeEditorSlide } = await import('./slide')
const { slidesLength } = await import('./presentation')
const { setCommandHistory } = await import('./historyMeta')

const text = (id: string) => ({ id, type: 'text', left: 10, top: 10, width: 100, height: 100 })

describe('leaving a slide while a text element is focused', () => {
	let recorded: any[]

	beforeEach(async () => {
		recorded = []
		setCommandHistory({
			execute: (command: any) => {
				command.execute(slides.value)
				recorded.push(command)
			},
		} as any)

		slides.value = [
			{ clientId: 'A', elements: [text('t1')] },
			{ clientId: 'B', elements: [text('t2')] },
		] as any
		slidesLength.value = 2
		slideIndex.value = 0
		activeElementIds.value = []
		focusElementId.value = null
		editorState.text = ''
		editorState.html = '<p></p>'

		for (let i = 0; i < 4; i++) await nextTick()
	})

	it('deletes the emptied text box off the slide it was on', async () => {
		activeElementIds.value = ['t1']
		focusElementId.value = 't1'
		for (let i = 0; i < 4; i++) await nextTick()

		changeEditorSlide(1)
		for (let i = 0; i < 6; i++) await nextTick()

		expect(slideIndex.value).toBe(1)
		expect(slides.value[0].elements).toEqual([])
		expect(slides.value[1].elements.map((e: any) => e.id)).toEqual(['t2'])
		expect(recorded.map((c) => c.jumpToSlideId)).toEqual(['A'])
	})

	// legacy content keeps patchEmptyParagraphs reporting an update forever, so
	// the save must become a no-op by comparison against the stored content, or
	// the watch's second blur-save pairs magic-move refIds against the new slide
	it('does not pair magic-move refIds against the slide it navigated to', async () => {
		const legacyHTML = '<p><span style="font-size: 16px">hello</span></p><p></p>'
		slides.value[0].elements[0].content = legacyHTML
		slides.value[1].transition = 'Magic Move'
		editorState.text = 'hello'
		editorState.html = legacyHTML

		activeElementIds.value = ['t1']
		focusElementId.value = 't1'
		for (let i = 0; i < 4; i++) await nextTick()

		changeEditorSlide(1)
		for (let i = 0; i < 6; i++) await nextTick()

		expect(recorded).toEqual([])
		expect(slides.value[0].elements[0].refId).toBeUndefined()
	})
})
