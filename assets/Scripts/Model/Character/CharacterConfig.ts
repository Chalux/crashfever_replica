export enum EElement {
    red = 1,
    blue = 2,
    green = 3,
    yellow = 4,
}

export enum ERace {
    human = 1,
    animal = 2,
    dragon = 4,
    machine = 8,
    god = 16,
    evil = 32,
    unknown = 64,
    mask = 0x7f,
}

export interface ICharacterConfig {
    id: string;
    name: string;
    element: EElement;
    race: number;
    icon?: string;
}

/** 角色配置加载器接口；实现可以依赖 cc，控制器只依赖这个接口。 */
export interface ICharacterConfigLoader {
    Load(): Promise<ICharacterConfig[]>;
}

export interface ICharacterConfigValidation {
    characters: ICharacterConfig[];
    errors: string[];
}

/** 校验整份角色配置；任一项非法或 id 重复都会拒绝整份配置。 */
export function validateCharacterConfigs(raw: unknown): ICharacterConfigValidation {
    if (!Array.isArray(raw)) {
        return {
            characters: [],
            errors: ['角色配置必须是数组'],
        };
    }

    const characters: ICharacterConfig[] = [];
    const errors: string[] = [];
    const ids = new Set<string>();

    for (let index = 0; index < raw.length; index++) {
        const value = raw[index];
        if (!value || typeof value !== 'object') {
            errors.push(`第 ${index + 1} 项不是对象`);
            continue;
        }

        const record = value as Record<string, unknown>;
        const id = typeof record.id === 'string' ? record.id.trim() : '';
        const name = typeof record.name === 'string' ? record.name.trim() : '';
        const element = record.element;
        const race = record.race;

        if (!id) {
            errors.push(`第 ${index + 1} 项缺少 id`);
            continue;
        }
        if (!name) {
            errors.push(`角色 ${id} 缺少 name`);
            continue;
        }
        if (!isValidElement(element)) {
            errors.push(`角色 ${id} 的 element 无效`);
            continue;
        }
        if (typeof race !== 'number' || !Number.isInteger(race) || race < 0 || (race & ERace.mask) === 0) {
            errors.push(`角色 ${id} 的 race 无效`);
            continue;
        }
        if (ids.has(id)) {
            errors.push(`角色 ID ${id} 重复`);
            continue;
        }

        ids.add(id);
        const character: ICharacterConfig = {
            id,
            name,
            element,
            race,
        };
        if (typeof record.icon === 'string' && record.icon.trim()) {
            character.icon = record.icon.trim();
        }
        characters.push(character);
    }

    if (errors.length > 0) {
        return {
            characters: [],
            errors,
        };
    }

    return {
        characters,
        errors,
    };
}

function isValidElement(value: unknown): value is EElement {
    return value === EElement.red
        || value === EElement.blue
        || value === EElement.green
        || value === EElement.yellow;
}
