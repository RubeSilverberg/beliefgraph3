const fs = require('fs');

// Read the JSON file
const data = JSON.parse(fs.readFileSync('investigation-graph.json', 'utf8'));

// Debug: check structure
console.log('Data is array:', Array.isArray(data));
console.log('Data length:', data.length);

if (data.length > 0) {
    console.log('First element keys:', Object.keys(data[0]));
    console.log('First element is array:', Array.isArray(data[0]));
    
    // Check if it's a nested array structure
    if (Array.isArray(data[0])) {
        console.log('Processing nested array structure...');
        
        let modified = 0;
        let opposingCount = 0;
        let withUserAssigned = 0;
        let edgeCount = 0;

        data[0].forEach((element, index) => {
            if (element.group === 'edges') {
                edgeCount++;
                if (element.data.opposes === true) {
                    opposingCount++;
                    console.log(`Found opposing edge: ${element.data.id}, weight: ${element.data.weight}, userAssignedWeight: ${element.data.userAssignedWeight}`);
                    
                    if (element.data.userAssignedWeight !== undefined) {
                        withUserAssigned++;
                    } else if (element.data.weight !== undefined) {
                        element.data.userAssignedWeight = element.data.weight;
                        modified++;
                        console.log(`  -> Added userAssignedWeight: ${element.data.weight}`);
                    }
                }
            }
        });

        // Write back to file
        fs.writeFileSync('investigation-graph.json', JSON.stringify(data, null, 2));
        console.log(`\nFound ${edgeCount} total edges, ${opposingCount} opposing edges, ${withUserAssigned} already had userAssignedWeight, modified ${modified} edges`);
    }
}
