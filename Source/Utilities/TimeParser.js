class TimeParser {
    static Parse(input) {
        if (typeof input !== 'string') return null;
        const text = input.trim().toLowerCase();
        const pattern = /(\d+)\s*(weeks?|w|days?|d|hours?|h|minutes?|m|seconds?|s)/g;
        let total = 0;
        let matched = '';
        for (const part of text.matchAll(pattern)) {
            const amount = Number(part[1]);
            if (!Number.isSafeInteger(amount)) return null;
            const unit = part[2];
            const multiplier = unit.startsWith('w') ? 604800000
                : unit.startsWith('d') ? 86400000
                    : unit.startsWith('h') ? 3600000
                        : unit.startsWith('m') ? 60000 : 1000;
            total += amount * multiplier;
            matched += part[0];
        }
        return Number.isSafeInteger(total) && total > 0 && matched.replace(/\s/g, '') === text.replace(/\s/g, '') ? total : null;
    }

    static Format(milliseconds) {
        let seconds = Math.max(0, Math.floor(milliseconds / 1000));
        const days = Math.floor(seconds / 86400);
        seconds %= 86400;
        const hours = Math.floor(seconds / 3600);
        seconds %= 3600;
        const minutes = Math.floor(seconds / 60);
        const parts = [];
        if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
        if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
        if (minutes || parts.length === 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
        return parts.join(', ');
    }
}

module.exports = { TimeParser };
