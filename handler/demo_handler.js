function handle(item) {
    const content = item.content;

    console.error(content);
    
    return item;
}

module.exports = { handle };