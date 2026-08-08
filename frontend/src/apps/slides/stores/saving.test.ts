import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const presentationId = ref('p1')
const presentationDoc = ref<any>({ modified: 'M1' })
const inReadonlyMode = ref(false)
const slides = ref<any[]>([{ clientId: 'c1', background: '#ff0000ff', elements: [] }])

let serverSave: (content: any) => Promise<void>

vi.mock('@/apps/slides/stores/presentation', () => ({
	presentationId,
	presentationDoc,
	inReadonlyMode,
	savePresentationDoc: (content: any) => serverSave(content),
}))

vi.mock('@/apps/slides/stores/slide', () => ({ slides }))

vi.mock('@/apps/slides/utils/helpers', () => ({
	cloneObj: (obj: any) => JSON.parse(JSON.stringify(obj)),
}))

const { saveCurrentState, markDirty, dirty, getPresentationFromLocalDB } = await import('./saving')

describe('saveCurrentState', () => {
	beforeEach(() => {
		presentationId.value = 'p1'
		presentationDoc.value = { modified: 'M1' }
		slides.value = [{ clientId: 'c1', background: '#ff0000ff', elements: [] }]
		serverSave = async () => {
			presentationDoc.value = { modified: 'M2' }
		}
	})

	it('persists edits made while the server save is in flight', async () => {
		markDirty()

		serverSave = async () => {
			// the user picks a second color while the first save is still in flight
			slides.value[0].background = '#00ff00ff'
			markDirty()
			presentationDoc.value = { modified: 'M2' }
		}

		await saveCurrentState()

		const local: any = await getPresentationFromLocalDB('p1')
		expect(dirty.value).toBe(true)
		expect(local.dirty).toBe(true)
		expect(local.content[0].background).toBe('#00ff00ff')
	})

	it('leaves the local copy alone when the editor moved on mid-save', async () => {
		markDirty()

		serverSave = async () => {
			// resetEditorState() blanks slides but leaves presentationId and the resource,
			// and savePresentationDoc then repoints presentationDoc at the old doc
			slides.value = []
			markDirty()
			presentationId.value = 'p2'
			presentationDoc.value = { modified: 'M2' }
		}

		await saveCurrentState()

		const local: any = await getPresentationFromLocalDB('p1')
		expect(local.content).toHaveLength(1)
		expect(local.baseModified).toBe('M1')
	})

	it('marks the local copy clean when nothing changed during the save', async () => {
		markDirty()

		await saveCurrentState()

		const local: any = await getPresentationFromLocalDB('p1')
		expect(dirty.value).toBe(false)
		expect(local.dirty).toBe(false)
		expect(local.baseModified).toBe('M2')
	})
})
