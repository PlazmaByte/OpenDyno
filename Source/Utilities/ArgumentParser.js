class ArgumentParser {
    static Parse(input) {
        const args = [];
        let current = '';
        let quote = null;
        let escaping = false;
        let active = false;

        for (const character of input) {
            if (escaping) {
                current += character;
                escaping = false;
                active = true;
                continue;
            }
            if (character === '\\' && quote) {
                escaping = true;
                continue;
            }
            if (quote) {
                if (character === quote) quote = null;
                else current += character;
                active = true;
                continue;
            }
            if (character === '"' || character === "'") {
                quote = character;
                active = true;
                continue;
            }
            if (/\s/.test(character)) {
                if (active) args.push(current);
                current = '';
                active = false;
                continue;
            }
            current += character;
            active = true;
        }

        if (escaping) current += '\\';
        if (active) args.push(current);
        return args;
    }
}

module.exports = { ArgumentParser };
