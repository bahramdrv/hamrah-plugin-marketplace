document.getElementById('print-report')?.addEventListener('click', async () => { await document.fonts.ready; window.print(); });
// Clear the loaded private document when the account signs out in another tab.
const accountChannel = new BroadcastChannel('kooch.account');
accountChannel.onmessage = () => { document.body.replaceChildren(); window.location.replace('/account'); };
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
