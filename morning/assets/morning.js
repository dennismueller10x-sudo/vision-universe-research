document.querySelector('.menu-button')?.addEventListener('click', event => {
  const nav = document.querySelector('.morning-header nav');
  const open = nav.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', String(open));
});
document.querySelectorAll('[data-share]').forEach(button => button.addEventListener('click', async () => {
  const url = location.href;
  const title = document.title;
  const target = button.dataset.share;
  if (target === 'copy') {
    await navigator.clipboard.writeText(url);
    button.textContent = 'Kopiert';
    return;
  }
  const shareUrl = target === 'x'
    ? `https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`
    : `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  window.open(shareUrl, '_blank', 'noopener,noreferrer,width=720,height=620');
}));
