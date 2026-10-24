export function date(value: string) {
  return new Date(value).toLocaleDateString('fa-IR', { dateStyle: 'medium', timeZone: 'Asia/Tehran' });
}
