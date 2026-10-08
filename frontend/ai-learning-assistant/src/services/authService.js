import axiosInstance from "../utils/axiosInstance";
import { API_PATHS } from "../utils/apiPaths";

const login=async (email,password)=>{
    try{
        const response=await axiosInstance.post(API_PATHS.AUTH.LOGIN ,{   //response is complete response object of of axios
            email,    //POST request backend ko send ki ja rhi hai and data bhi backend ko bheja ja rha hai and jo response.data aaya hai wo server(backend )se aaya hai
            password
        });
        return response.data;
    } catch(error){
        throw error.response?.data || {message:"An unknown error occured"}
    }
}

const register=async(username,email,password)=>{
    try{
        const response=await axiosInstance.post(API_PATHS.AUTH.REGISTER ,{   
            username,
            email,    
            password
        });
        return response.data;
    } catch(error){
        throw error.response?.data || {message:"An unknown error occured"}
    }
}

const getProfile=async()=>{
    try{
    const response=await axiosInstance.get(API_PATHS.AUTH.GET_PROFILE)
    return response.data
    }catch(error){
        throw error.response?.data || {message:"An unknown error occured"}
    }
}

const updateProfile=async(userData)=>{
    try{
        const response=await axiosInstance.put(API_PATHS.AUTH.UPDATE_PROFILE,userData)
        return response.data;
    }catch(error){
        throw error.response?.data || {message:"An unknown error occured"}
    }
}

const changePassword=async(passwords)=>{
    try{
        const response=await axiosInstance.post(API_PATHS.AUTH.CHANGE_PASSWORD,passwords)
        return response.data
    }catch(error){
        throw error.response?.data || {message:"An unknown error occured"}
    }
}


const authService={
    login,
    register,
    getProfile,
    updateProfile,
    changePassword
}

export default authService

/**
 * ✅ 6️⃣ Smart Error Handling
throw error.response?.data || { message: "An unknown error occured" }
Iska matlab:
agar server ne proper error bheja:
error.response.data
to wo throw karo

?. = optional chaining
agar response exist nahi karta to crash nahi hoga
Agar kuch bhi nahi mila
to default ye send karo:
{ message: "An unknown error occured" }
Isse frontend ko hamesha meaningful message milta hai 👌
 */