const sectionClasses = 'flex flex-col p-3 border-b'
const sectionTitleClasses = 'text-base font-medium text-gray-800'
const fieldLabelClasses = 'text-sm text-gray-600'

const selectionColor = '#3B82F6'
const guideColor = '#C026D3'

const MAX_BORDER_RADIUS = 50

const defaultBorderColor = '#d2d2d2ff'
const defaultShadowColor = '#7C7C7CFF'

const labelClasses = 'select-none font-text text-base text-ink-gray-5'
const chevronClasses = 'lucide-chevron-down ml-auto size-4 shrink-0 text-ink-gray-4'

const getHandleBaseStyles = (scale) => ({
	position: 'absolute',
	zIndex: 9999,
	backgroundColor: '#ffffff',
	border: `${1.5 / scale}px solid ${selectionColor}`,
	boxShadow: `0 ${1 / scale}px ${2 / scale}px rgba(0, 0, 0, 0.16)`,
	boxSizing: 'border-box',
})

const allowedImageFileTypes = [
	'image/jpeg',
	'image/jpg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/svg+xml',
]

export {
	sectionClasses,
	sectionTitleClasses,
	fieldLabelClasses,
	allowedImageFileTypes,
	selectionColor,
	guideColor,
	MAX_BORDER_RADIUS,
	defaultBorderColor,
	defaultShadowColor,
	labelClasses,
	chevronClasses,
	getHandleBaseStyles,
}
