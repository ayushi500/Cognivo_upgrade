import React,{ createContext, useContext, useState,useEffect} from "react"

const AuthContext=createContext();

//custom hook
export const useAuth=()=>{
        const context=useContext(AuthContext);
        if(!context){
          throw new Error("useAuth must be used within an AuthProvider")  //🔴 Ye error kab aayega?
//Jab tum useAuth() ko aise component me use kr loge jo AuthProvider se wrap nahi hua hai.
 }
 return context
}

export const AuthProvider=({children})=>{
  const [user,setUser]=useState(null);
  const [loading,setLoading]=useState(true);
  const [isAuthenticated,setIsAuthenticated]=useState(false);



useEffect(()=>{
  checkAuthStatus();
},[]);  //it means kewal ek baar hi jb page render hoga,to user ki authentication check ki jaayegi

const checkAuthStatus=async()=>{
  try{
    const token=localStorage.getItem("token");
    const userStr=localStorage.getItem('user')   //local storage me strings store hoti hain and JSON me object hote hain

    if(userStr && token){
      const userData=JSON.parse(userStr);
      setUser(userData);
      setIsAuthenticated(true)
    }
  }catch(error){
    console.error('Auth check failed',error);
    logout()
  }finally{
    setLoading(false)
  }
}

//user ko login krne ke liye function
const login=(userData,token)=>{   //agr user ke pass token hai,to ye user ko login kra dega
  localStorage.setItem('token',token);
  localStorage.setItem('user',JSON.stringify(userData));

  setUser(userData);
  setIsAuthenticated(true)
}

//user ko logout krne ke liye function
const logout=()=>{
  localStorage.removeItem('token');
  localStorage.removeItem('user')

  setUser(null)
  setIsAuthenticated(false)
  window.location.href='/'
}

//user ko update krne ke liye function
const updateUser=(updatedUser)=>{
  const newUserData={...user,...updatedUser}
  localStorage.setItem('user',JSON.stringify(newUserData))
  setUser(newUserData)
}

const value={
  user,
  loading,
  isAuthenticated,
  login,
  logout,
  updateUser,checkAuthStatus
}


return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}