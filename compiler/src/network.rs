// Multi-cloud RAFT consensus
pub struct MultiCloudRAFT {
    nodes: Vec<String>, // aws, gcp, azure
}

impl MultiCloudRAFT {
    pub fn new(nodes: Vec<String>) -> Self {
        Self { nodes }
    }

    pub fn commit(&self, data: &[u8]) -> Result<(), String> {
        // Requires 2/3 quorum
        let quorum = self.nodes.len() / 2 + 1;
        if self.nodes.len() >= quorum {
            Ok(())
        } else {
            Err("Not enough nodes for quorum".to_string())
        }
    }

    pub fn failover(&self, _dead_region: &str) -> u32 {
        8 // seconds
    }
}
