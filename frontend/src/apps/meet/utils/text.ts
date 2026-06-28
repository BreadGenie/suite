export function getInitials(name: string, fallback = ""): string {
	const trimmed = name.trim();
	if (!trimmed) return fallback;

	return trimmed.charAt(0).toUpperCase();
}
