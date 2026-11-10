// Only expanded nodes allocate children. Each expansion loads at most 100 rows.
export function createJsonPathTree(container, loadChildren) {
    let generation = 0;

    function label(className, text) {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = text;
        return span;
    }

    function node(descriptor, version, autoOpen = false) {
        const isContainer = descriptor.type === 'object' || descriptor.type === 'array';
        const element = document.createElement(isContainer ? 'details' : 'div');
        element.className = isContainer ? 'tree-node' : 'tree-leaf tree-node';
        const row = isContainer ? document.createElement('summary') : element;
        row.append(label('tree-key', descriptor.key), label('tree-colon', ':'));
        if (!isContainer) {
            const value = label(`tree-value type-${descriptor.type}`, descriptor.text + (descriptor.shortened ? ' …' : ''));
            if (descriptor.shortened) value.title = '字符串较长，复制全部结果可获取完整内容';
            row.append(value);
            return element;
        }
        row.append(label('tree-type', descriptor.type === 'array' ? `Array(${descriptor.count})` : `object {${descriptor.count}}`));
        const children = document.createElement('div');
        children.className = 'tree-children';
        element.append(row, children);
        let loaded = false;
        let loading = false;
        async function appendPage(offset, moreButton) {
            if (loading) return;
            loading = true;
            if (moreButton) { moreButton.disabled = true; moreButton.textContent = '加载中…'; }
            children.setAttribute('aria-busy', 'true');
            try {
                const data = await loadChildren(descriptor.path, offset);
                if (version !== generation) return;
                moreButton?.remove();
                children.append(...data.nodes.map(item => node(item, version)));
                loaded = true;
                if (data.nextOffset < data.count) {
                    const more = document.createElement('button');
                    more.type = 'button';
                    more.className = 'tool-btn tree-load-more';
                    more.textContent = `显示更多（${data.nextOffset} / ${data.count}）`;
                    more.addEventListener('click', () => appendPage(data.nextOffset, more));
                    children.append(more);
                }
            } catch (error) {
                if (version !== generation) return;
                if (moreButton) { moreButton.disabled = false; moreButton.textContent = '加载失败，点击重试'; }
                else children.replaceChildren(label('tree-placeholder', `加载失败：${error.message}，请收起后重试`));
            } finally {
                loading = false;
                children.setAttribute('aria-busy', 'false');
            }
        }
        element.addEventListener('toggle', () => {
            if (element.open && !loaded) {
                children.replaceChildren();
                appendPage(0);
            }
        });
        element.open = autoOpen;
        return element;
    }

    return {
        clear(message = '') {
            generation++;
            container.replaceChildren(label('tree-placeholder', message));
        },
        render(data) {
            const version = ++generation;
            const root = document.createElement('details');
            root.className = 'tree-node';
            root.open = true;
            const summary = document.createElement('summary');
            summary.append(label('tree-root-label', 'root'), label('tree-type', `Array(${data.total})`));
            const children = document.createElement('div');
            children.className = 'tree-children';
            children.append(...data.nodes.map(item => node(item, version, data.nodes.length === 1)));
            root.append(summary, children);
            container.replaceChildren(root);
            container.scrollTop = 0;
            container.scrollLeft = 0;
        },
        collapse() {
            container.querySelectorAll('details').forEach(element => { element.open = false; });
        },
    };
}
