import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# 模拟一个底层的数据库查询，当 Page 被软删除或不存在时返回 None
def get_page_by_id(page_id: str) -> Optional[Dict[str, Any]]:
    if "archive" in page_id:
        return None
    return {"id": page_id, "title": "My Workspace", "status": "active", "blocks": []}

def update_page_blocks(page_id: str, new_blocks: list) -> Dict[str, Any]:
    logger.info(f"Attempting to update blocks for page: {page_id}")
    page = get_page_by_id(page_id)
    
    if page.get("status") == "active":
        page["blocks"].extend(new_blocks)
        return {"success": True, "data": page}
        
    return {"success": False, "error": "Page is inactive"}
