import asyncio

def process_user_data(user_id):
    user = fetch_from_db(user_id) 
    # 故意制造缺陷 2：没有防御性空值校验，直接访问属性，100% 触发 AttributeError
    print(user.name) 

def save_report():
    f = open("report.txt", "w")
    f.write("Done")
    # 故意不写 f.close()
