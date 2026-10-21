class ErrorHandler {
    static async Handle(error, commandContext) {
        console.error(`[Error] Execution failed in ${commandContext.CommandName || 'Unknown'}:`, error);
        if (!commandContext || commandContext.HasResponded) return;
        if (error?.code === 50013) {
            return commandContext.ReplyError('Missing Permissions', 'OpenDyno lacks the required Discord permissions to perform this action.');
        }
        if (error?.code === 50007) {
            return commandContext.ReplyError('Direct Messages Blocked', 'Cannot send a direct message to the target user.');
        }
        return commandContext.ReplyError('Execution Error', 'An unexpected internal error occurred while executing this command.');
    }
}

module.exports = { ErrorHandler };
