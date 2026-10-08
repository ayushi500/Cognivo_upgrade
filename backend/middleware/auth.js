import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const protect=async (req,res,next)=>{
    let token;

    //check if the token exists in Authorization header
    try{
        token=req.headers.authorization.split(' ')[1];

        //verify tokens
        const decoded=jwt.verify(token,process.env.JWT_SECRET);
        req.user=await User.findById(decoded.id).select('-password')
        
    if(!req.user){
    return res.status(401).json({
        success:false,
        error:"User not found ",
        statusCode:401,
    })
    }
    next();
 } catch (error){
        console.error('Auth middleware error:',error.message)
        
        if(error.name==="TokenExpiredError"){
          return res.status(401).json({
            success:false,
            error:"Token has expired",
            statusCode:401
          })
        }
    

    return res.status(401).json({
        success:false,
        error:"Not authorised,token failed"
    })
 
}

if(!token){
    return res.status(401).json({
       status:false,
       error:"Not authorised, no token",
       statusCode:401 
    })
}
}

export default protect