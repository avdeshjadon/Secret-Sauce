export async function handleExternalLink(url) {
    if (window.secretSauce && window.secretSauce.handleExternalLinkClick) {
        await window.secretSauce.handleExternalLinkClick(url);
    } else {
        // Fallback or use bridge directly
        const { ipcRenderer } = window.require('electron');
        await ipcRenderer.invoke('open-external', url);
    }
}

export function setupCommonHandlers(component) {
    component.handleExternalLinkClick = async (url) => {
        const { ipcRenderer } = window.require('electron');
        await ipcRenderer.invoke('open-external', url);
    };
}
