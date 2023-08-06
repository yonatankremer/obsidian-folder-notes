import { MarkdownPostProcessorContext, parseYaml, TAbstractFile, TFolder, TFile } from 'obsidian';
import { extractFolderName, getFolderNote } from './functions/folderNoteFunctions';
import FolderNotesPlugin from './main';
import { FolderOverviewSettings } from './modals/folderOverview';
import { getExcludedFolder } from './excludedFolder';
export type yamlSettings = {
	title?: string;
	disableTitle?: boolean;
	depth?: number;
	type?: 'folder' | 'markdown' | 'canvas' | 'other' | 'pdf' | 'images' | 'audio' | 'video' | 'all';
	includeTypes?: string[];
	style?: 'list' | 'grid';
	disableFileTag?: boolean;
	sortBy?: 'name' | 'created' | 'modified' | 'nameAsc' | 'createdAsc' | 'modifiedAsc';
	showEmptyFolders?: boolean;
	onlyIncludeSubfolders?: boolean;
};

export function createCanvasOverview() {
	// console.log('test');
}

export function createOverview(plugin: FolderNotesPlugin, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
	// parse source to yaml
	let yaml: yamlSettings = parseYaml(source);
	if (!yaml) {
		yaml = {
			title: plugin.settings.defaultOverview.title,
			disableTitle: plugin.settings.defaultOverview.disableTitle,
			depth: plugin.settings.defaultOverview.depth,
			type: plugin.settings.defaultOverview.type,
			includeTypes: plugin.settings.defaultOverview.includeTypes,
			style: plugin.settings.defaultOverview.style,
			disableFileTag: plugin.settings.defaultOverview.disableFileTag,
			sortBy: plugin.settings.defaultOverview.sortBy,
			showEmptyFolders: plugin.settings.defaultOverview.showEmptyFolders,
			onlyIncludeSubfolders: plugin.settings.defaultOverview.onlyIncludeSubfolders,
		};
	}
	const depth = yaml?.depth || 1;
	let title = yaml?.title || plugin.settings.defaultOverview.title || '{{folderName}} overview';
	const folderName = extractFolderName(plugin.settings.folderNoteName, plugin.removeExtension(plugin.getFolderNameFromPathString(ctx.sourcePath)));
	title = title.replaceAll('{{folderName}}', folderName || '');
	const disableTitle = yaml?.disableTitle || plugin.settings.defaultOverview.disableTitle || false;
	let includeTypes: string[] = yaml?.includeTypes || plugin.settings.defaultOverview.includeTypes || ['folder', 'markdown'];
	includeTypes = includeTypes.map((type) => type.toLowerCase());
	const style: 'list' | 'grid' = yaml?.style || 'list';
	const disableFileTag = yaml?.disableFileTag || plugin.settings.defaultOverview.disableFileTag || false;
	const showEmptyFolders = yaml?.showEmptyFolders || plugin.settings.defaultOverview.showEmptyFolders || false;
	const pathBlacklist: string[] = [];


	el.parentElement?.classList.add('folder-overview-container');
	const root = el.createEl('div', { cls: 'folder-overview' });
	const titleEl = root.createEl('h1', { cls: 'folder-overview-title' });
	const ul = root.createEl('ul', { cls: 'folder-overview-list' });
	if (!disableTitle) {
		titleEl.innerText = title;
	}
	if (includeTypes.length === 0) { return; }
	let files: TAbstractFile[] = [];
	const sourceFile = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
	if (!sourceFile) return;
	const sourceFolderPath = plugin.getFolderPathFromString(ctx.sourcePath);
	let sourceFolder: TFolder | undefined;
	if (sourceFile.parent instanceof TFolder) {
		sourceFolder = sourceFile.parent;
	} else {
		sourceFolder = plugin.app.vault.getAbstractFileByPath(plugin.getFolderPathFromString(ctx.sourcePath)) as TFolder;
	}

	files = sourceFolder.children;

	files = files.filter((file) => {
		const folderPath = plugin.getFolderPathFromString(file.path);
		if (!folderPath.startsWith(sourceFolderPath)) { return false; }
		const excludedFolder = getExcludedFolder(plugin, file.path);
		if (excludedFolder?.excludeFromFolderOverview) { return false; }
		if (file.path === ctx.sourcePath) { return false; }
		if ((file.path.split('/').length - sourceFolderPath.split('/').length) - 1 < depth) {
			return true;
		}
	});
	if (!includeTypes.includes('folder')) {
		files = getAllFiles(files, sourceFolderPath, depth);
	}
	if (files.length === 0) {
		// create button to edit the overview
		const editButton = root.createEl('button', { cls: 'folder-overview-edit-button' });
		editButton.innerText = 'Edit overview';
		editButton.addEventListener('click', (e) => {
			e.stopImmediatePropagation();
			e.preventDefault();
			e.stopPropagation();
			new FolderOverviewSettings(plugin.app, plugin, parseYaml(source), ctx, el).open();
		}, { capture: true });
	}
	files = sortFiles(files, yaml, plugin);

	if (style === 'grid') {
		const grid = root.createEl('div', { cls: 'folder-overview-grid' });
		files.forEach(async (file) => {
			const gridItem = grid.createEl('div', { cls: 'folder-overview-grid-item' });
			const gridArticle = gridItem.createEl('article', { cls: 'folder-overview-grid-item-article' });
			if (file instanceof TFile) {
				const fileContent = await plugin.app.vault.read(file);
				// skip --- yaml
				const descriptionEl = gridArticle.createEl('p', { cls: 'folder-overview-grid-item-description' });
				let description = fileContent.split('\n')[0];
				if (description.length > 64) {
					description = description.slice(0, 64) + '...';
				}
				descriptionEl.innerText = description;
				const link = gridArticle.createEl('a', { cls: 'folder-overview-grid-item-link internal-link' });
				const title = link.createEl('h1', { cls: 'folder-overview-grid-item-link-title' });
				title.innerText = file.name.replace('.md', '').replace('.canvas', '');
				link.href = file.path;
			} else if (file instanceof TFolder) {
				const folderItem = gridArticle.createEl('div', { cls: 'folder-overview-grid-item-folder' });
				const folderName = folderItem.createEl('h1', { cls: 'folder-overview-grid-item-folder-name' });
				folderName.innerText = file.name;
			}
		});
	} else if (style === 'list') {
		files.forEach((file) => {
			if (file instanceof TFolder) {
				const folderItem = addFolderList(plugin, ul, pathBlacklist, file);
				goThroughFolders(plugin, folderItem, file, depth, sourceFolderPath, ctx, yaml, pathBlacklist, includeTypes, disableFileTag);
			} else if (file instanceof TFile) {
				addFileList(plugin, ul, pathBlacklist, file, includeTypes, disableFileTag);
			}
		});
	} else if (style === 'explorer') {
	} else if (style === 'testing') {
		cloneFileExplorerView(plugin, ctx, root, yaml, pathBlacklist);
	}
	if (includeTypes.length > 1 && style !== 'grid' && (!showEmptyFolders || yaml.onlyIncludeSubfolders)) {
		removeEmptyFolders(ul, 1, yaml);
	}
}
function cloneFileExplorerView(plugin: FolderNotesPlugin, ctx: MarkdownPostProcessorContext, root: HTMLElement, yaml: yamlSettings, pathBlacklist: string[]) {
	const folder = plugin.getEL(plugin.getFolderPathFromString(ctx.sourcePath))
	const folderElement = folder?.parentElement;
	console.log(folderElement)
	if (!folderElement) return;
	const newFolderElement = folderElement.cloneNode(true) as HTMLElement;
	newFolderElement.querySelectorAll('div.tree-item-icon').forEach((el) => {
		if (el instanceof HTMLElement) {
			el.onclick = () => {
				handleCollapseClick(el, plugin, yaml, pathBlacklist);
			}
		}
	});
	root.appendChild(newFolderElement);
}
function handleCollapseClick(el: HTMLElement, plugin: FolderNotesPlugin, yaml: yamlSettings, pathBlacklist: string[]) {
	el.classList.toggle('is-collapsed');
	if (el.classList.contains('is-collapsed')) {
		console.log(el.parentElement?.parentElement);
		console.log(el.parentElement?.parentElement?.childNodes[1])
		console.log(el.parentElement?.parentElement?.querySelector('tree-item-children'))
		el.parentElement?.parentElement?.childNodes[1]?.remove();
	} else {
		console.log(el.parentElement)
		const path = el.parentElement?.getAttribute('data-path');
		if (!path) return;
		const folder = plugin.app.vault.getAbstractFileByPath(path);
		if (!(folder instanceof TFolder)) return;
		const folderElement = el.parentElement?.parentElement;
		if (!folderElement) return;
		console.log('folderElement', folderElement);
		const childrenElement = folderElement.createDiv({ cls: 'tree-item-children nav-folder-children' });
		let files = sortFiles(folder.children, {}, plugin);
		files = filterFiles(files, plugin, path, yaml.depth || 1, pathBlacklist);
		files.forEach((child) => {
			if (child instanceof TFolder) {
				const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon right-triangle"><path d="M3 8L12 17L21 8"></path></svg>';
				const folderElement = childrenElement.createDiv({
					cls: 'tree-item nav-folder',
				});
				const folderTitle = folderElement.createDiv({
					cls: 'tree-item-self is-clickable nav-folder-title',
					attr: {
						'data-path': child.path,
						'draggable': 'true'
					},
				})
				const collapseIcon = folderTitle.createDiv({
					cls: 'tree-item-icon collapse-icon nav-folder-collapse-indicator',
				});
				collapseIcon.innerHTML = svg;
				collapseIcon.onclick = () => {
					handleCollapseClick(collapseIcon, plugin, yaml, pathBlacklist);
				}
				folderTitle.createDiv({
					cls: 'tree-item-inner nav-folder-title-content',
					text: child.name,
				});
			} else if (child instanceof TFile) {
				const fileElement = childrenElement.createDiv({
					cls: 'tree-item nav-file',
				});
				const fileTitle = fileElement.createDiv({
					cls: 'tree-item-self is-clickable nav-file-title',
					attr: {
						'data-path': child.path,
						'draggable': 'true'
					},
				})
				fileTitle.createDiv({
					cls: 'tree-item-inner nav-file-title-content',
					text: child.basename,
				});
				if (child.extension !== 'md') {
					fileTitle.createDiv({
						cls: 'nav-file-tag',
						text: child.extension
					});
				}
			}
		});
		// move folders above files
	}
}


function goThroughFolders(plugin: FolderNotesPlugin, list: HTMLLIElement | HTMLUListElement, folder: TFolder,
	depth: number, sourceFolderPath: string, ctx: MarkdownPostProcessorContext, yaml: yamlSettings, pathBlacklist: string[], includeTypes: string[], disableFileTag: boolean) {
	if (sourceFolderPath === '') {
		depth--;
	}
	let files = filterFiles(folder.children, plugin, sourceFolderPath, depth, pathBlacklist);
	files = sortFiles(files, yaml, plugin);
	const ul = list.createEl('ul', { cls: 'folder-overview-list' });
	files.forEach((file) => {
		if (file instanceof TFolder) {
			const folderItem = addFolderList(plugin, ul, pathBlacklist, file);
			goThroughFolders(plugin, folderItem, file, depth, sourceFolderPath, ctx, yaml, pathBlacklist, includeTypes, disableFileTag);
		} else if (file instanceof TFile) {
			addFileList(plugin, ul, pathBlacklist, file, includeTypes, disableFileTag);
		}
	});
}

function filterFiles(files: TAbstractFile[], plugin: FolderNotesPlugin, sourceFolderPath: string, depth: number, pathBlacklist: string[]) {
	return files.filter((file) => {
		console.log('pathBlacklist', pathBlacklist);
		if (pathBlacklist.includes(file.path)) { return false; }
		const folderPath = plugin.getFolderPathFromString(file.path);
		if (!folderPath.startsWith(sourceFolderPath)) { return false; }
		const excludedFolder = getExcludedFolder(plugin, file.path);
		if (excludedFolder?.excludeFromFolderOverview) { return false; }
		if ((file.path.split('/').length - sourceFolderPath.split('/').length) - 1 < depth) {
			return true;
		}
	});
}

function sortFiles(files: TAbstractFile[], yaml: yamlSettings, plugin: FolderNotesPlugin) {
	if (!yaml?.sortBy) {
		yaml.sortBy = plugin.settings.defaultOverview.sortBy || 'name';
	}
	return files.sort((a, b) => {
		// sort by folder first
		if (a instanceof TFolder && !(b instanceof TFolder)) {
			return -1;
		}
		if (!(a instanceof TFolder) && b instanceof TFolder) {
			return 1;
		}
		if (!(a instanceof TFile) || !(b instanceof TFile)) { return -1; }
		if (yaml.sortBy === 'created') {
			if (a.stat.ctime > b.stat.ctime) {
				return -1;
			} else if (a.stat.ctime < b.stat.ctime) {
				return 1;
			}
		} else if (yaml.sortBy === 'createdAsc') {
			if (a.stat.ctime < b.stat.ctime) {
				return -1;
			} else if (a.stat.ctime > b.stat.ctime) {
				return 1;
			}
		} else if (yaml.sortBy === 'modified') {
			if (a.stat.mtime > b.stat.mtime) {
				return -1;
			} else if (a.stat.mtime < b.stat.mtime) {
				return 1;
			}
		} else if (yaml.sortBy === 'modifiedAsc') {
			if (a.stat.mtime < b.stat.mtime) {
				return -1;
			} else if (a.stat.mtime > b.stat.mtime) {
				return 1;
			}
		}
		// sort by name
		if (a.name < b.name && yaml.sortBy === 'name') {
			return -1;
		} else if (a.name > b.name && yaml.sortBy === 'nameAsc') {
			return -1;
		}

		if (a.name > b.name && yaml.sortBy === 'name') {
			return 1;
		} else if (a.name < b.name && yaml.sortBy === 'nameAsc') {
			return 1;
		}
		return 0;
	});
}

function removeEmptyFolders(ul: HTMLUListElement | HTMLLIElement, depth: number, yaml: yamlSettings) {
	const childrensToRemove: ChildNode[] = [];
	ul.childNodes.forEach((el) => {
		const childrens = (el as Element).querySelector('ul');
		if (!childrens || childrens === null) { return; }
		if (childrens && !childrens?.hasChildNodes() && !(el instanceof HTMLUListElement)) {
			childrensToRemove.push(el);
		} else if (el instanceof HTMLUListElement || el instanceof HTMLLIElement) {
			removeEmptyFolders(el, depth + 1, yaml);
		}
	});
	childrensToRemove.forEach((el) => {
		if (yaml.onlyIncludeSubfolders && depth === 1) { return; }
		el.remove();
	});
}

function addFolderList(plugin: FolderNotesPlugin, list: HTMLUListElement | HTMLLIElement, pathBlacklist: string[], folder: TFolder) {
	const folderItem = list.createEl('li', { cls: 'folder-overview-list folder-list' });
	const folderNote = getFolderNote(plugin, folder.path);
	if (folderNote instanceof TFile) {
		const folderNoteLink = folderItem.createEl('a', { cls: 'folder-overview-list-item folder-name-item internal-link', href: folderNote.path });
		folderNoteLink.innerText = folder.name;
		pathBlacklist.push(folderNote.path);
	} else {
		const folderName = folderItem.createEl('span', { cls: 'folder-overview-list-item folder-name-item' });
		folderName.innerText = folder.name;
	}
	return folderItem;
}

function addFileList(plugin: FolderNotesPlugin, list: HTMLUListElement | HTMLLIElement, pathBlacklist: string[], file: TFile, includeTypes: string[], disableFileTag: boolean) {
	if (includeTypes.length > 0 && !includeTypes.includes('all')) {
		if (file.extension === 'md' && !includeTypes.includes('markdown')) return;
		if (file.extension === 'canvas' && !includeTypes.includes('canvas')) return;
		if (file.extension === 'pdf' && !includeTypes.includes('pdf')) return;
		const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
		if (imageTypes.includes(file.extension) && !includeTypes.includes('image')) return;
		const videoTypes = ['mp4', 'webm', 'ogv', 'mov', 'mkv'];
		if (videoTypes.includes(file.extension) && !includeTypes.includes('video')) return;
		const audioTypes = ['mp3', 'wav', 'm4a', '3gp', 'flac', 'ogg', 'oga', 'opus'];
		if (audioTypes.includes(file.extension) && includeTypes.includes('audio')) return;
		const allTypes = ['md', 'canvas', 'pdf', ...imageTypes, ...videoTypes, ...audioTypes];
		if (!allTypes.includes(file.extension) && !includeTypes.includes('other')) return;
	}
	if (pathBlacklist.includes(file.path)) return;
	const listItem = list.createEl('li', { cls: 'folder-overview-list file-link' });
	const nameItem = listItem.createEl('div', { cls: 'folder-overview-list-item' });
	const link = nameItem.createEl('a', { cls: 'internal-link', href: file.path });
	link.innerText = file.basename;
	if (file.extension !== 'md' && !disableFileTag) {
		nameItem.createDiv({ cls: 'nav-file-tag' }).innerText = file.extension;
	}
}

function getAllFiles(files: TAbstractFile[], sourceFolderPath: string, depth: number) {
	const allFiles: TAbstractFile[] = [];
	files.forEach((file) => {
		if (file instanceof TFolder) {
			if ((file.path.split('/').length - sourceFolderPath.split('/').length) - 1 < depth - 1) {
				allFiles.push(...getAllFiles(file.children, sourceFolderPath, depth));
			}
		} else {
			allFiles.push(file);
		}
	});
	return allFiles;
}