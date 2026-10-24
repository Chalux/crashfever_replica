export function downloadJson(filename: string, json: string): void {
    const blob = new Blob([json], {
        type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    // 给浏览器时间处理下载。
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function selectJsonFile(
    onSelected: (text: string) => Promise<void>,
    onError: (error: unknown) => void,
): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    input.addEventListener('change', () => {
        const file = input.files?.[0];
        input.remove();

        // 玩家取消选择时，不导入。
        if (!file) return;

        void (async () => {
            try {
                const text = await file.text();
                await onSelected(text);
            } catch (error) {
                onError(error);
            }
        })();
    }, { once: true });

    input.addEventListener('cancel', () => {
        input.remove();
    }, { once: true });

    document.body.appendChild(input);
    input.click();
}