import React from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../../utils/auth";

interface Props {
  children: JSX.Element;
}
const RequireAuth = ({ children }: Props) => {
  const { isFetching, user } = useSession();
  const location = useLocation();

  if (!isFetching && !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default RequireAuth;
